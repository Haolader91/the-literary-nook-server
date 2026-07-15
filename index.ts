import { MongoClient } from "mongodb";
import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import "dotenv/config";
import Stripe from "stripe";

const app: Express = express();
const port = 5000;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16" as any,
});

app.use(express.json());
app.use(cors());

app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

// ======================================================

const mongoUri = process.env.MONGODB_URL;

if (!mongoUri) {
  console.error("Error: MONGODB_URL is not defined in .env file!");
  process.exit(1);
}

const client = new MongoClient(mongoUri);

export async function connectToMongoDB() {
  try {
    // await client.connect();

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
    app.post("/api/books", async (req: Request, res: Response) => {
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
    app.post("/api/carts", async (req: Request, res: Response) => {
      try {
        const { bookId, title, genre, price, imageUrl, quantity, userEmail } =
          req.body;

        const query = { bookId: bookId };
        const existingItem = await cartsCollection.findOne(query);

        if (existingItem) {
          const newQuantity = existingItem.quantity + quantity;

          if (newQuantity < 1) {
            return res.send({
              message: "Quantity cannot be less than 1",
              modifiedCount: 0,
            });
          }

          const updateDoc = {
            $set: { quantity: newQuantity },
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
            quantity: quantity < 1 ? 1 : quantity,
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

    // genres page
    app.get("/api/genres", async (req: Request, res: Response) => {
      try {
        const genresWithCount = await booksCollection
          .aggregate([
            {
              $group: {
                _id: "$genre",
                count: { $sum: 1 },
              },
            },
            {
              $project: {
                _id: 0,
                name: "$_id",
                count: 1,
              },
            },
          ])
          .toArray();

        res.send(genresWithCount);
      } catch (error) {
        console.error("Error fetching dynamic genres:", error);
        res.status(500).send({ message: "Failed to fetch genres" });
      }
    });

    // genres slug page
    app.get("/api/genres-count", async (req: Request, res: Response) => {
      try {
        const counts = await booksCollection
          .aggregate([
            {
              $group: {
                _id: "$genre",
                count: { $sum: 1 },
              },
            },
          ])
          .toArray();

        res.send(counts);
      } catch (error) {
        console.error("Error fetching genre counts:", error);
        res.status(500).send({ message: "Failed to fetch genre counts" });
      }
    });

    // payment Stripe Checkout Session API
    app.post(
      "/api/create-checkout-session",
      async (req: Request, res: Response) => {
        try {
          const { cartItems, shippingFee } = req.body;

          const line_items = cartItems.map((item: any) => ({
            price_data: {
              currency: "usd",
              product_data: {
                name: item.title,
                images: item.imageUrl ? [item.imageUrl] : [],
                metadata: {
                  bookId: item.bookId,
                  genre: item.genre,
                },
              },

              unit_amount: Math.round(Number(item.price) * 100),
            },
            quantity: item.quantity,
          }));

          if (shippingFee > 0) {
            line_items.push({
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Estimated Shipping Fee",
                },
                unit_amount: Math.round(shippingFee * 100),
              },
              quantity: 1,
            });
          }

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: line_items,
            mode: "payment",

            success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cart`,
          });

          res.status(200).json({ url: session.url });
        } catch (error: any) {
          console.error("Stripe error:", error);
          res.status(500).json({ message: error.message });
        }
      },
    );
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
