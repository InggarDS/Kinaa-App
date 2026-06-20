🍼 KINAA APP (Minimum Viable Product)

KINAA APP is a mobile-responsive web application specifically designed to help breastfeeding mothers and parents track their baby's nutritional intake. This app allows users to log the duration of breastfeeding sessions, record the volume of breastmilk/formula consumed, and provides visual insights comparing the baby's actual intake with normal intake standards based on their age.

✨ Key Features

🔐 User Authentication: Login and Registration system using Email and Password.

☁️ Real-time Cloud Database: Seamless data synchronization using Firebase Firestore. Data is secure and won't be lost even if you switch devices.

👶 Smart Baby Profile: The system automatically calculates the baby's age (in days/months) in real-time based on their birth date.

⏱️ Breastfeeding Duration Tracker:

Integrated Stopwatch to record breastfeeding duration directly.

Manual Input option to log time if you forgot to start the stopwatch.

🍼 Volume Consumption Tracker:

Large numpad for easy one-handed input.

Quick Add buttons (+10ml, +30ml, +50ml, etc.).

📊 Comparative Charts (Smart Insights): Visualizes the last 7 days of volume intake, visually compared against a target line (normal consumption limit) tailored to the baby's age.

🎓 Interactive Tutorial (New!): Onboarding guide for first-time users to help them understand the app's features quickly.

🛠️ Technologies Used

Frontend Framework: React.js

Styling: Tailwind CSS (Mobile-first design)

Icons: Lucide React

Backend & Database: Firebase (Authentication & Firestore)

🚀 Local Installation & Development Guide

If you want to run this application on your local machine (using Vite or Create React App), follow these steps:

1. Prerequisites

Ensure you have Node.js installed on your computer.

2. Clone Repository & Installation

Create a new React project and install the required dependencies:

# If using Vite (Recommended)
npm create vite@latest kinaa-app -- --template react
cd kinaa-app

# Install main dependencies
npm install firebase lucide-react

# Install Tailwind CSS (follow the official Tailwind guide for Vite/CRA)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p


3. Firebase Configuration

This application requires Firebase for Authentication and Database services.

Create a new project in the Firebase Console.

Enable Firebase Authentication (Select Email/Password & Anonymous sign-in methods).

Enable Cloud Firestore (Start in Test Mode for the development phase).

Get your Firebase Config object from the project settings.

Inside your App.jsx file, replace the Firebase initialization section with your own config:

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};
const app = initializeApp(firebaseConfig);
// ...


(Note: The code version provided might use global variables like __firebase_config specific to sandbox environments; ensure you adapt this for your local environment).

4. Run the Application

Start the local development server:

npm run dev
# or npm start (if using CRA)


Open http://localhost:5173 in your browser (it is highly recommended to use the responsive/mobile inspector mode in your browser for the best experience).

📱 UX/UI Approach

Mobile-First: The interface is specifically designed for ease of use on mobile screens because the target users (mothers) often only have one hand free while breastfeeding.

Clutter-Free: A clean bottom navigation design that focuses on one primary task per page.

🗺️ Future Development Roadmap

[x] Add Interactive Tutorial (Onboarding) for first-time users.

[ ] Time range filters for charts (Monthly, Yearly).

[ ] Export data to PDF/CSV formats for pediatrician reports.

[ ] Breastfeeding reminder/alarm feature.

Created to simplify the incredible journey of every mother and baby. ❤️
