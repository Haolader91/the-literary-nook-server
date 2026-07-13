import { MongoClient } from "mongodb";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import "dotenv/config"; // ✅ ১. মডার্ন উপায়ে dotenv ইমপোর্ট করা হলো

const app: Express = express();
const port = 5000;

// মিডলওয়্যার (ভবিষ্যতে ফ্রন্টএন্ড থেকে ডাটা পোস্ট করার জন্য এটি লাগবে)
app.use(express.json());
app.use(cors());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

// ======================================================
//  ২. টাইপ সেফটি নিশ্চিত করতে fallback বা টাইপ কাস্টিং ব্যবহার করা হয়েছে
const mongoUri = process.env.MONGODB_URL;

if (!mongoUri) {
  console.error("Error: MONGODB_URL is not defined in .env file!");
  process.exit(1);
}

const client = new MongoClient(mongoUri);

export async function connectToMongoDB() {
  try {
    await client.connect();

    interface Book {
      title: string;
      shortDescription: string;
      fullDescription: string;
      price: string;
      genre: string;
      imageUrl?: string;
    }
    interface CartItem {
      bookId: string;
      title: string;
      genre: string;
      price: string | number;
      imageUrl?: string;
      quantity: number;
      userEmail?: string;
    }
    const database = client.db("the_literary_nook");
    const booksCollection = database.collection<Book>("Books");
    const cartsCollection = database.collection<CartItem>("Carts");

    // new book data page
    app.post("/api/books", async (req, res) => {
      const book = req.body;
      const result = await booksCollection.insertOne(book);
      res.send(result);
    });
    // book dekanor api
    app.get("/api/books", async (req: Request, res: Response) => {
      try {
        const result = await booksCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching books:", error);
        res.status(500).send({ message: "Failed to fetch books" });
      }
    });

    // cart post
    app.post("/api/carts", async (req, res) => {
      try {
        const { bookId, title, genre, price, imageUrl, quantity, userEmail } =
          req.body;

        const query = { bookId: bookId };
        const existingItem = await cartsCollection.findOne(query);

        if (existingItem) {
          const updateDoc = {
            $set: { quantity: existingItem.quantity + quantity },
          };
          const result = await cartsCollection.updateOne(query, updateDoc);
          res.send(result);
        } else {
          const result = await cartsCollection.insertOne({
            bookId,
            title,
            genre,
            price,
            imageUrl,
            quantity,
            userEmail,
          });
          res.send(result);
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to add to cart" });
      }
    });

    // car get
    app.get("/api/carts", async (req: Request, res: Response) => {
      try {
        const result = await cartsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch cart items" });
      }
    });

    //cart delete
    app.delete("/api/carts/:id", async (req: Request, res: Response) => {
      try {
        const id = req.params.id;
        const result = await cartsCollection.deleteOne({ bookId: id });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to delete cart item" });
      }
    });

    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

connectToMongoDB();

// ======================================================
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
