# Smart Route Management and Scheduling System (SRMSS)

## Project Overview

The Smart Route Management and Scheduling System (SRMSS) is a web-based application developed to digitalize and streamline public transport depot operations.

## Technology Stack

### Frontend
- HTML5
- CSS3
- JavaScript
- Bootstrap 5

### Backend
- FastAPI
- Python 3.12

### Database & Authentication
- Firebase Realtime Database
- Firebase Authentication
- Pyrebase4

## System Modules

1. Authentication & User Management Module
2. Route Planning & Management Module
3. Vehicle Management Module
4. Driver Management Module
5. Schedule Management Module
6. Depot Operations Dashboard Module
7. Fuel & Maintenance Management Module
8. Reporting & Analytics Module

## Project Structure

```text
SRMSS/
├── app/
│   ├── main.py
│   ├── firebase_config.py
│   ├── routes/
│   ├── services/
│   └── schemas/
├── frontend/
│   ├── pages/
│   ├── css/
│   └── js/
├── tests/
├── requirements.txt
└── README.md
```

## User Roles

### Admin
- Manage users
- Manage routes
- Manage vehicles
- Manage drivers

### Manager
- Manage schedules
- Generate reports
- Monitor dashboard

### Driver
- View assigned routes and schedules

### User
- View routes and track buses

## Testing

- Black Box Testing
- Authentication Testing
- Route Testing
- Schedule Conflict Testing
- Report Generation Testing

## Deployment

- Backend: Render/Railway
- Frontend: Netlify/Vercel
- Database: Firebase

## Future Enhancements

- Mobile App
- SMS Notifications
- AI Route Optimization
- Predictive Maintenance
