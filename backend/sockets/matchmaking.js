let waitingUsers = [];

function handleSockets(io) {
  io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    socket.on("joinQueue", (user) => {
      waitingUsers.push({
        socketId: socket.id,
        interests: user.interests
      });

      matchUsers(io);
    });

    socket.on("sendMessage", ({ to, message }) => {
      io.to(to).emit("receiveMessage", {
        message,
        from: socket.id
      });
    });

    socket.on("next", () => {
      waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
    });

    socket.on("disconnect", () => {
      waitingUsers = waitingUsers.filter(u => u.socketId !== socket.id);
    });
  });
}

function matchUsers(io) {
  if (waitingUsers.length < 2) return;

  for (let i = 0; i < waitingUsers.length; i++) {
    for (let j = i + 1; j < waitingUsers.length; j++) {
      const user1 = waitingUsers[i];
      const user2 = waitingUsers[j];

      const common = user1.interests.some(i =>
        user2.interests.includes(i)
      );

      if (common) {
        waitingUsers.splice(j, 1);
        waitingUsers.splice(i, 1);

        io.to(user1.socketId).emit("matched", user2.socketId);
        io.to(user2.socketId).emit("matched", user1.socketId);

        return;
      }
    }
  }

  // fallback random
  const user1 = waitingUsers.shift();
  const user2 = waitingUsers.shift();

  io.to(user1.socketId).emit("matched", user2.socketId);
  io.to(user2.socketId).emit("matched", user1.socketId);
}

module.exports = { handleSockets };