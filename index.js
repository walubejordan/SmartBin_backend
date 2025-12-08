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

// Firebase service account from environment variables
const serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
  universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
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

app.get("/", (req, res) => {
  res.send("SmartBin Backend is running");
});

// Add a new bin
app.post("/bins", verifyToken, async (req, res) => {
  const { name, Location } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO bins (name, Location) VALUES ($1, $2) RETURNING *",
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
    const result = await pool.query("SELECT * FROM bins");
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
      "INSERT INTO assignments (user_id, bin_id) VALUES ($1, $2) RETURNING *",
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
    const result = await pool.query(
      `
      SELECT bins.*
      FROM bins
      INNER JOIN assignments 
      ON bins.id = assignments.bin_id
      WHERE assignments.user_id = $1
    `,
      [user_id]
    );

    res.send(result.rows);
  } catch (err) {
    res.status(500).send({ error: "Failed to fetch user bins" });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
