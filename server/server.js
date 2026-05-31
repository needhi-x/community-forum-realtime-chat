require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

// ================== SERVER ==================
const server = http.createServer(app);

// ================== SOCKET ==================
const io = new Server(server, {
  cors: { origin: "*" }
});

// ================== MONGO DB ==================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("DB Error:", err));

// ================== MODELS ==================
const User = mongoose.model(
  "User",
  new mongoose.Schema({
    username: String,
    email: String,
    password: String
  })
);

const Discussion = mongoose.model(
  "Discussion",
  new mongoose.Schema({
    title: String,
    createdBy: String,
    createdAt: { type: Date, default: Date.now }
  })
);

const Message = mongoose.model(
  "Message",
  new mongoose.Schema({
    room: String,
    user: String,
    message: String,
    time: { type: Date, default: Date.now }
  })
);

// ================== AUTH ROUTES ==================

// REGISTER
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.json({ msg: "User already exists" });

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email,
      password: hash
    });

    res.json({ msg: "Registered successfully", user });
  } catch (err) {
    res.json({ msg: "Error", err });
  }
});

// LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.json({ msg: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ msg: "Wrong password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({
      msg: "Login successful",
      token,
      user
    });
  } catch (err) {
    res.json({ msg: "Error", err });
  }
});

// ================== DISCUSSIONS ==================

// CREATE DISCUSSION
app.post("/discussion", async (req, res) => {
  const d = await Discussion.create(req.body);
  res.json(d);
});

// GET DISCUSSIONS
app.get("/discussion", async (req, res) => {
  const d = await Discussion.find();
  res.json(d);
});

// ================== SOCKET REAL-TIME ==================

const onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // USER ONLINE
  socket.on("user_online", (username) => {
    onlineUsers.set(socket.id, username);
    io.emit("online_users", Array.from(onlineUsers.values()));
  });

  // JOIN ROOM
  socket.on("join_room", (room) => {
    socket.join(room);
  });

  // TYPING
  socket.on("typing", (data) => {
    socket.to(data.room).emit("typing", data.user);
  });

  // MESSAGE
  socket.on("send_message", async (data) => {
    await Message.create(data);
    io.to(data.room).emit("receive_message", data);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    onlineUsers.delete(socket.id);
    io.emit("online_users", Array.from(onlineUsers.values()));
  });
});

// ================== START SERVER ==================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});