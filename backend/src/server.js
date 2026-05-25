import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <h1>Ocean Specials</h1>
    <p>Server is running.</p>
  `);
});

app.get("/api/test", (req, res) => {
  res.json({
    ok: true,
    message: "Ocean Specials API is working"
  });
});

const port = process.env.PORT || 10000;

app.listen(port, () => {
  console.log(`Ocean Specials running on port ${port}`);
});
