# IT23320628 Translator & UI Testing

This repository contains automated tests for a university assignment using Playwright. The tests cover both the translator functionality and the user interface (UI) of the application.

## Project Structure

- `tests/` - Contains Playwright test scripts:
  - `IT23320628_translator.spec.js`: Tests for the translator feature.
  - `IT23320628_ui.spec.js`: Tests for UI elements and interactions.
- `test-data/` - Test data files (if any).
- `test-results/` - Stores Playwright test results.
- `playwright-report/` - Generated HTML reports after test runs.
- `playwright.config.cjs` - Playwright configuration file.
- `package.json` - Project dependencies and scripts.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/IT23320628.git
   cd IT23320628
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Tests
To execute all Playwright tests:
```bash
npx playwright test
```

To view the HTML report after running tests:
```bash
npx playwright show-report
```

## Assignment Details
- **Module:** IT23320628
- **Purpose:** Automated testing of translator and UI features for a university assignment.
- **Tools Used:** Playwright, Node.js

## Author
- Name: [K D C D Dharmasena]
- Student ID: IT23320628

## License
This project is for educational purposes only.
