# eBay Pricing Strategy Frontend (React + Vite)

## Main Goal

This frontend application provides an interface for eBay sellers to manage, assign, and monitor advanced pricing strategies and competitor rules for their eBay listings. The main goal is to help sellers automate and optimize their pricing based on competitor data, custom rules, and dynamic strategies, all through an easy-to-use dashboard.

## What is Happening in This Project

- **User Authentication:**

  - Provides secure login and registration forms for sellers.
  - Handles authentication state using JWT tokens and persists user sessions.
  - Ensures only authenticated users can access inventory and strategy management features.

- **Inventory Management:**

  - Displays a dashboard of all active eBay listings for the authenticated user.
  - Allows users to view product details, current prices, and status.
  - Supports navigation to listing-specific pages for editing strategies, viewing competitors, and price history.

- **Pricing Strategies:**

  - Enables users to create, edit, and assign pricing strategies to their listings.
  - Supports multiple strategy types (e.g., match lowest, beat lowest, stay above, custom).
  - Provides forms and validation for strategy parameters such as min/max price, adjustment type, and value.
  - Allows users to see which listings are using each strategy and to update or remove strategies as needed.

- **Competitor Monitoring:**

  - Lets users manually add competitor listings to monitor for each of their products.
  - Displays competitor details such as title, price, country, and image.
  - Monitors the prices of manually added competitors every 20 minutes and updates the UI accordingly.
  - Allows users to remove competitors or accept competitor prices for repricing.

- **Automated Repricing:**

  - Provides controls to trigger repricing for individual listings or in bulk.
  - Shows status and results of automated price updates based on selected strategies and competitor changes.
  - Notifies users of successful or failed repricing actions.

- **History & Analytics:**

  - Displays a detailed history of all price changes for each product, including old/new price, strategy used, and reason for change.
  - Provides analytics and summary statistics to help users understand pricing trends and strategy effectiveness.
  - Allows exporting of price history data for further analysis.

- **Modern UI:**
  - Built with React for a responsive, component-based user experience.
  - Uses Material UI for consistent, accessible, and visually appealing design.
  - Manages global and local state with Zustand for simplicity and performance.
  - Developed with Vite for fast development, hot module replacement, and optimized builds.

---

This frontend communicates with a Node.js/Express backend (see backend README) that handles all business logic, database operations, and eBay API integration.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript and enable type-aware lint rules. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
