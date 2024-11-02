# API Boilerplate

A robust Node.js API boilerplate built with TypeScript, Express, MongoDB, and Redis. This project provides a solid foundation for building scalable backend services with user authentication, role-based access control, and Docker support.

## 🚀 Features

- **TypeScript Support**: Full TypeScript implementation for better type safety and developer experience
- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Database Integration**: MongoDB integration with Mongoose ODM
- **Caching**: Redis integration for caching
- **Docker Support**: Containerization with Docker and Docker Compose
- **Input Validation**: Request validation using Zod
- **Logging**: Structured logging with Winston
- **User Management**: Comprehensive user model with different roles (Owner, Customer, Employee)
- **Security**: Password hashing with Argon2
- **API Documentation**: Clear route structure and documentation

## 📋 Prerequisites

- Node.js (v18 or higher)
- pnpm (v7 or higher)
- Docker and Docker Compose
- MongoDB (if running locally)
- Redis (if running locally)

## 🛠️ Installation

1. Fork this repository and clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/api-boilerplate.git
cd api-boilerplate
```

2. Install dependencies:
```bash
pnpm install
```

3. Create a `.env` file in the root directory:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/api-boilerplate
REDIS_URI=redis://localhost:6379
JWT_SECRET=your-secret-key
```

## 🚀 Running the Application

### Using Docker (Recommended)

1. Build and start the containers:
```bash
docker-compose up --build
```

This will start:
- API server on port 3000
- MongoDB on port 27017
- Redis on port 6379

### Running Locally

1. Start MongoDB and Redis locally
2. Start the development server:
```bash
pnpm dev
```

## 📁 Project Structure

```
src/
├── config/           # Configuration files
│   ├── database.ts   # MongoDB connection
│   └── logger.ts     # Winston logger setup
├── controllers/      # Request handlers
├── middlewares/      # Express middlewares
├── models/          # Mongoose models
├── routes/          # API routes
├── services/        # Business logic
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── app.ts           # Express app setup
```

## 🔒 Authentication

The API uses JWT-based authentication. There are three user types:
- `OWNER`: Administrative access
- `CUSTOMER`: Regular user access
- `EMPLOYEE`: Staff access

### Authentication Flow

1. Register a new user:
```bash
POST /api/auth/register
Content-Type: application/json

{
  "type": "customer",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword",
  "phone": "1234567890",
  "document": "123456789",
  "bornAt": "1990-01-01",
  "sex": 1,
  "address": {
    "line1": "123 Main St",
    "postalCode": "12345",
    "neighborhood": "Downtown",
    "state": "CA"
  }
}
```

2. Login:
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
```

3. Use the returned JWT token in subsequent requests:
```bash
GET /api/profile
Authorization: Bearer <your_jwt_token>
```

## 🔐 Authorization

Protected routes use the `authenticate` middleware and can be further restricted by user type using the `authorize` middleware:

```typescript
app.get('/api/admin/dashboard', 
  authenticate, 
  authorize([UserType.OWNER]), 
  dashboardController
);
```

## 🧪 Testing

Run the test suite:
```bash
pnpm test
```

## 🛠️ Development

### Adding New Routes

1. Create a new route file in `src/routes/`
2. Create corresponding controller in `src/controllers/`
3. Add service logic in `src/services/`
4. Register the route in `src/app.ts`

### Validation

Use Zod schemas for request validation:

```typescript
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

router.post('/endpoint', validateRequest(schema), controller);
```

## 🚀 Production Deployment

1. Build the application:
```bash
pnpm build
```

2. Set production environment variables:
```env
NODE_ENV=production
MONGODB_URI=your_production_mongodb_uri
REDIS_URI=your_production_redis_uri
JWT_SECRET=your_production_secret
```

3. Start the production server:
```bash
pnpm start
```

## 📝 Contributing

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Commit: `git commit -m 'Add some feature'`
5. Push: `git push origin feature/your-feature`
6. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Express.js team
- Mongoose team
- TypeScript team
- All contributors to the dependencies used in this project

## ⚠️ Important Notes

- Remember to change the JWT secret in production
- Keep your dependencies updated
- Follow the security best practices when deploying to production
- Regular backups of MongoDB data are recommended

## 📞 Support

For support, please open an issue in the GitHub repository or contact the maintainers.
