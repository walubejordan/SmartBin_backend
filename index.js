const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});


const app = express();
app.use(express.json());
app.use(cors());

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(require("./serviceAccountKey.json")),
});

// Middleware to verify Firebase token
async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).send({ error: "No token provided" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).send({ error: "Invalid token" });
  }
}

// Test route
app.get("/", (req, res) => {
  res.send("SmartBin Backend is running");
});

// Protected route example
app.get("/profile", verifyToken, (req, res) => {
  res.send({ message: "Token is valid", user: req.user });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Add a new bin
app.post("/bins", verifyToken, async (req, res) => {
  const { name, Location } = req.body;

  try {
    const result = await pool.query(
      "insert into bins (name, Location) values ($1, $2, $3) returning *",
      [name, Location]
    );
    res.send(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to add bin" });
  }
});

// Get all bins
app.get("/bins", async (req, res) => {
  try {
    const result = await pool.query("select * from bins");
    res.send(result.rows);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch bins" });
  }
});

// Assign a bin to a user
app.post("/assign-bin", verifyToken, async (req, res) => {
  const { user_id, bin_id } = req.body;

  try {
    const result = await pool.query(
      "insert into assignments (user_id, bin_id) values ($1, $2) returning *",
      [user_id, bin_id]
    );

    res.send(result.rows[0]);
  } catch (err) {
    res.status(500).send({ error: "Failed to assign bin" });
  }
});

// Get bins assigned to a user
app.get("/user-bins/:user_id", verifyToken, async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await pool.query(`
      select bins.*
      from bins
      inner join assignments on bins.id = assignments.bin_id
      where assignments.user_id = $1
    `, [user_id]);

    res.send(result.rows);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch user bins" });
  }
});
