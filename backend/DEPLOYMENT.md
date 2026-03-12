# Smart-TS Backend Deployment Configuration

## Railway Deployment

### Environment Variables Required
Set these in Railway dashboard:
- `MONGO_URL` - MongoDB connection string (MongoDB Atlas recommended)
- `RESEND_API_KEY` - API key from resend.com
- `SENDER_EMAIL` - Verified sender email for Resend
- `DB_NAME` - Database name (default: werkbon_db)

### Deployment Steps
1. Create Railway account at railway.app
2. Create new project
3. Connect GitHub repository
4. Set environment variables
5. Deploy

### Database Migration
Current MongoDB data will be preserved if using the same MONGO_URL.
For new MongoDB Atlas setup:
1. Create MongoDB Atlas account
2. Create new cluster
3. Get connection string
4. Update MONGO_URL in Railway

### Health Check
- Endpoint: /api/health
- Method: GET
- Expected: { "status": "healthy" }
