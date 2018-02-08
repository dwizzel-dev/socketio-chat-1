'use strict';

// Setup basic express server
var express = require('express');
const _ = require('lodash');
const session = require('express-session');
const uuid = require('uuid');
var app = express();
var path = require('path');
var http = require('http');
var server = http.createServer(app);
var io = require('./lib')(server);
var port = process.env.PORT || 3000;
// user sockets holder
var userSockets = {};
// We need the same instance of the session parser in express and
// WebSocket server.
const sessionParser = session({
  saveUninitialized: false,
  secret: '$eCuRiTy',
  resave: false
});
// function session validation
const validateSession = (socket, next) => {
  sessionParser(socket.request, {}, () => {
    console.log('Session is parsed!');
    if (typeof socket.request.session.userId !== 'undefined') {
      console.log(`user is validated: ${socket.request.session.userId}`);
      next();
    } else {
      // reject here if user is unknown.
      console.log('reject connection');
      socket.disconnect();
    }
  });
};
// sockets handler
const ioSocket = (socket) => {
  var addedUser = false;
  console.log(`new connection: ${socket.request.session.userId}`);
  socket.userId = socket.request.session.userId;
  userSockets[socket.userId] = socket;
  console.log('A-NUM: ' + _.size(userSockets));
  // when the client emits 'new message', this listens and executes
  socket.on('new message', function (data) {
    // we tell the client to execute 'new message'
    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data
    });
  });
  // when the client emits 'add user', this listens and executes
  socket.on('add user', (username) => {
    if (addedUser) return;
    // we store the username in the socket session for this client
    socket.username = username;
    ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: numUsers
    });
    // echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });
  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });
  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', () => {
    _.unset(userSockets, socket.userId);
    console.log('D-NUM: ' + _.size(userSockets));
    if (addedUser) {
      --numUsers;
      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
};
// Routing
app.use(express.static(path.join(__dirname, 'public')));
// use sessions
app.use(sessionParser);
// http login session
app.get('/login', (request, response) => {
  const id = uuid.v4();
  console.log(`Updating session for user ${id}`);
  request.session.userId = id;
  try {
    response.send({ result: 'OK', message: 'Session updated' });
    response.end();
  } catch (e) {
    console.log(e);
  }
});
// http logout session
app.get('/logout', (request, response) => {
  console.log('Destroying session');
  try {
    let userId = request.session.userId;
    console.log(`destroy userId: ${userId}`);
    request.session.destroy();
    // _.find(userSockets, {'userId': userId}).disconnect();
    if (typeof userId !== 'undefined') {
      response.send({ result: 'OK', message: 'Session destroyed' });
      if (typeof userSockets[userId] !== 'undefined') {
        userSockets[userId].disconnect();
      }
    } else {
      response.send({ result: 'OK', message: 'No Active Session to destroy' });
    }
    response.end();
  } catch (err) {
    console.log(err);
  }
});
// http server listening
server.listen(port, () => {
  console.log('Server listening at port %d', port);
});
// Chatroom
var numUsers = 0;
// use validation
io.use(validateSession);
// connections
io.on('connection', (socket) => {
  ioSocket(socket);
});
