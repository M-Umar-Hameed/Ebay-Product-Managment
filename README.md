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





# eBay Pricing Strategy Backend (Node.js + Express + MongoDB)

## Main Goal

The backend provides all core business logic, data storage, and integration with eBay APIs for an automated eBay repricing and competitor monitoring platform. Its main goal is to enable sellers to define, apply, and automate complex pricing strategies for their eBay listings, leveraging real-time competitor data and custom rules.

## What is Happening in This Project

- **User Management & Authentication:**

  - Provides secure registration and login endpoints for sellers.
  - Uses JWT (JSON Web Tokens) for stateless authentication and session management.
  - Stores user information in MongoDB, including eBay OAuth tokens for API access.
  - Middleware ensures that only authenticated users can access protected resources.

- **eBay OAuth Integration:**

  - Implements the OAuth 2.0 flow to allow users to connect their eBay accounts.
  - Handles authorization code exchange, token refresh, and token storage.
  - Ensures all eBay API requests are made on behalf of the authenticated user.
  - Manages token expiry and refresh logic transparently.

- **Pricing Strategies:**

  - Supports CRUD (Create, Read, Update, Delete) operations for pricing strategies.
  - Strategies define how product prices should be adjusted (e.g., match lowest, beat lowest, stay above, custom rules).
  - Strategies can be assigned to one or more listings, and can include constraints like min/max price, no-competition actions, and more.
  - Each strategy tracks its usage, history, and which listings it is applied to.

- **Competitor Rules:**

  - Allows creation and management of rules that define how to react to competitor prices.
  - Rules can be assigned to products to automate responses to competitor price changes (e.g., always undercut by $1, stay above by 5%, etc.).
  - Supports both global rules and per-listing rules for fine-grained control.

- **Competitor Monitoring:**

  - There is **no auto-discovery** of competitors for listings. Only competitors that are **manually added by the user** are tracked and monitored.
  - Stores and manages competitor listings that are manually added by the user.
  - Fetches competitor prices and product details from eBay for these manually added competitors.
  - Associates competitor data with user listings for real-time price comparison and strategy execution.
  - Provides endpoints to add, remove, and list competitors for any product.
  - The prices of manually added competitors are **monitored every 20 minutes** for changes, and any detected price changes can trigger repricing logic according to the assigned strategies and rules.

- **Automated Price Updates:**

  - Periodically or on-demand, executes pricing strategies for all or selected listings.
  - Calculates new prices based on current competitor data and assigned strategies.
  - Updates prices on eBay via the eBay API, ensuring compliance with user-defined constraints.
  - Handles error cases, rate limiting, and logs all price update attempts.

- **Price History Tracking:**

  - Records every price change, including old price, new price, strategy used, and reason for change.
  - Stores a detailed audit trail for analytics, reporting, and rollback if needed.
  - Provides endpoints to query price history, view trends, and export data for further analysis.

- **RESTful API:**
  - Exposes a comprehensive set of endpoints for the frontend to manage inventory, strategies, competitors, and analytics.
  - Follows REST principles for resource management (GET, POST, PUT, DELETE).
  - Includes robust error handling, validation, and consistent response formats.
  - Secured by authentication middleware and input validation.

---

This backend is designed to work with the React frontend (see client/README.md) and requires MongoDB for data storage and valid eBay API credentials for full functionality.
