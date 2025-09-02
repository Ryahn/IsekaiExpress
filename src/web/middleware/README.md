# Middleware Documentation

This directory contains modular middleware classes that can be used to organize and structure your Express.js application.

## Available Middleware

### 1. RedisMiddleware
Handles Redis client creation, connection, event handling, and graceful shutdown.

**Usage:**
```javascript
const { RedisMiddleware } = require('./middleware');

const redisMiddleware = new RedisMiddleware();
const redisClient = redisMiddleware.initialize();
await redisMiddleware.connect();
```

**Features:**
- Automatic reconnection with exponential backoff
- Event logging for connection states
- Graceful shutdown handling
- Configurable connection timeout

### 2. SessionMiddleware
Manages session configuration and Redis store setup.

**Usage:**
```javascript
const { SessionMiddleware } = require('./middleware');

const sessionMiddleware = new SessionMiddleware(redisClient);
app.use(sessionMiddleware.getMiddleware());
```

**Features:**
- Redis-based session storage
- Configurable cookie settings
- Secure session configuration
- Customizable session name and TTL

### 3. PassportMiddleware
Handles Passport.js initialization and user serialization/deserialization.

**Usage:**
```javascript
const { PassportMiddleware } = require('./middleware');

const passportMiddleware = new PassportMiddleware();
passportMiddleware.getAllMiddleware().forEach(middleware => {
  app.use(middleware);
});
```

**Features:**
- Automatic user serialization/deserialization
- Safe user data handling (removes sensitive fields)
- Proper middleware ordering

### 4. AuditMiddleware
Logs audit information for non-GET requests.

**Usage:**
```javascript
const { AuditMiddleware } = require('./middleware');

const auditMiddleware = new AuditMiddleware();
app.use(auditMiddleware.getMiddleware());
```

**Features:**
- Configurable method exclusions
- Custom user ID extraction
- Path-based exclusions
- Flexible audit logging

### 5. AuthMiddleware
Validates session expiration and redirects to login if needed.

**Usage:**
```javascript
const { AuthMiddleware } = require('./middleware');

const authMiddleware = new AuthMiddleware();
app.use(authMiddleware.getMiddleware());
```

**Features:**
- Configurable excluded paths
- Session expiry validation
- Custom redirect handling
- Flexible session validation

### 6. StaticMiddleware
Handles Nunjucks configuration, static file serving, and view engine setup.

**Usage:**
```javascript
const { StaticMiddleware } = require('./middleware');

const staticMiddleware = new StaticMiddleware(app);
staticMiddleware.apply();
```

**Features:**
- Nunjucks template engine configuration
- Static file serving
- Body parsing middleware
- Production trust proxy setup
- View engine configuration

## Complete Example

```javascript
const express = require("express");
const { 
  RedisMiddleware, 
  SessionMiddleware, 
  PassportMiddleware,
  AuditMiddleware,
  AuthMiddleware,
  StaticMiddleware 
} = require("./middleware");

const app = express();

// Initialize Redis
const redisMiddleware = new RedisMiddleware();
const redisClient = redisMiddleware.initialize();
await redisMiddleware.connect();

// Setup sessions
const sessionMiddleware = new SessionMiddleware(redisClient);
app.use(sessionMiddleware.getMiddleware());

// Setup static files and templates
const staticMiddleware = new StaticMiddleware(app);
staticMiddleware.apply();

// Setup Passport
const passportMiddleware = new PassportMiddleware();
passportMiddleware.getAllMiddleware().forEach(middleware => {
  app.use(middleware);
});

// Setup audit logging
const auditMiddleware = new AuditMiddleware();
app.use(auditMiddleware.getMiddleware());

// Setup authentication
const authMiddleware = new AuthMiddleware();
app.use(authMiddleware.getMiddleware());

// Your routes here...
```

## Configuration

All middleware classes support configuration through their constructors or setter methods. Check individual middleware files for available options.

## Benefits

- **Modularity**: Each middleware has a single responsibility
- **Reusability**: Middleware can be easily reused across different applications
- **Testability**: Individual middleware functions can be unit tested
- **Maintainability**: Easier to modify specific functionality
- **Clean Architecture**: Main app file becomes more focused and readable
