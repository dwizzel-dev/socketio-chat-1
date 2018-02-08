'use strict';

// Setup basic express server
var dbg = require('debug')('socket-chat-1::index');

var express = require('express');
const _ = require('lodash');
const session = require('express-session');
const uuid = require('uuid');
var app = express();
var path = require('path');
var http = require('http');
var server = http.createServer(app);
// si serverClient a true alors va le chercher dans /node_modules/socket.io-client/dist/
var io = require('./lib')(server, {
  path: '/sockets', // path: '/admin',
  serveClient: false
});
// const adminNamespace = io.of('/admin');
// const chatNamespace = io.of('/chat');
// origin du domaine
io.origins((origin, callback) => {
  console.log(origin);
  if (origin !== 'http://localhost:3000/') {
    return callback(new Error('origin not allowed'), false);
  }
  callback(null, true);
});
//
// les ports et host
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
// debugger console or debug
const Debug = {
  log (obj, toConsole = true) {
    if (toConsole) {
      console.log(obj);
    } else {
      dbg(obj);
    }
  }
};
// function session validation
const validateSession = (socket, next) => {
  sessionParser(socket.request, {}, () => {
    Debug.log('Session is parsed!');
    if (typeof socket.request.session.userId !== 'undefined') {
      Debug.log(`user is validated: ${socket.request.session.userId}`);
      next();
    } else {
      // reject here if user is unknown.
      Debug.log('reject connection');
      socket.disconnect();
    }
  });
};
// sockets handler
const ioChatSocket = (socket) => {
  var addedUser = false;
  Debug.log(`new connection: ${socket.request.session.userId}`);
  socket.userId = socket.request.session.userId;
  userSockets[socket.userId] = socket;
  Debug.log('A-NUM: ' + _.size(userSockets));
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
    Debug.log('D-NUM: ' + _.size(userSockets));
    if (addedUser) {
      --numUsers;
      // echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: socket.username,
        numUsers: numUsers
      });
    }
  });
  // packet filtering
  socket.use((packet, next) => {
    Debug.log(`${socket.userId} : ${packet}`);
    next();
    // next(new Error('Not a doge error'));
  });
};
// Routing
app.use(express.static(path.join(__dirname, 'public')));
// use sessions
app.use(sessionParser);
// http login session
app.get('/login', (request, response) => {
  const id = uuid.v4();
  Debug.log(`Updating session for user ${id}`);
  request.session.userId = id;
  try {
    response.send({ result: 'OK', message: 'Session updated' });
    response.end();
  } catch (e) {
    Debug.log(e);
  }
});
// http logout session
app.get('/logout', (request, response) => {
  Debug.log('Destroying session');
  try {
    let userId = request.session.userId;
    Debug.log(`destroy userId: ${userId}`);
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
    Debug.log(err);
  }
});
// http server listening
server.listen(port, () => {
  Debug.log('Server listening at port %d', port);
});
// Chatroom
var numUsers = 0;
// use validation
io.use(validateSession);
// connections
/*
io.on('connection', (socket) => {
  console.log('connect to /chat');
  ioSocket(socket);
});
*/
io.of('/chat').on('connect', (socket) => {
  Debug.log('connect to /chat');
  ioChatSocket(socket);
});
io.of('/admin').on('connect', (socket) => {
  Debug.log('connect to /admin');
});
io.on('connect', (socket) => {
  Debug.log('connect to /');
});
