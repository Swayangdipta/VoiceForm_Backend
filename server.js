require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes.js");
const applicationRoutes = require("./routes/applicationRoutes.js");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/api/applications", applicationRoutes);

app.listen(process.env.PORT, () =>
  console.log("Server running on port " + process.env.PORT)
);