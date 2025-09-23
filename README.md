# Enyalis Chat Server Backend

A modular chat server backend inspired by Mattermost, built with Node.js and Express.

## Features
- User registration and login (JWT authentication)
- Channel creation and listing
- Basic messaging within channels
- Modular, clean code structure
- Ready for local development (Windows) and Docker deployment (Ubuntu)

## Project Structure
- `src/controllers/` — Business logic for users, channels, messages
- `src/routes/` — API route definitions
- `src/models/` — (Placeholder for future database models)
- `src/middleware/` — Authentication middleware
- `src/server.js` — App entry point

## Local Development (Windows)
1. Copy `.env.example` to `.env` and set your secrets.
2. Install dependencies:
   ```
npm install
   ```
3. Start the server:
   ```
npm run dev
   ```
4. API available at `http://localhost:3000`

## Docker Deployment (Ubuntu/Any)
1. Copy `.env.example` to `.env` and set your secrets.
2. Build and run with Docker Compose:
   ```
docker-compose up --build
   ```
3. API available at `http://localhost:3000`

## API Endpoints
- `POST /api/users/register` — Register new user
- `POST /api/users/login` — Login and get JWT
- `GET /api/users/me` — Get user profile (protected)
- `POST /api/channels` — Create channel
- `GET /api/channels` — List channels
- `POST /api/messages` — Send message
- `GET /api/messages/:channelId` — Get messages for channel

## Expansion Plan
- Add persistent database (e.g., PostgreSQL, MongoDB)
- Add user/channel/message models
- Add real-time messaging (WebSocket)
- Add admin and moderation features
- Add tests and CI/CD

---

For questions or contributions, open an issue or PR.
