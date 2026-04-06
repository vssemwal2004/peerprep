# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Time Pickers (iOS-style)

This project includes two reusable time pickers under `src/components/`:

- `TimePickerIOS.jsx`: Flatpickr in time-only mode with iOS-style wheel look (CSS-based). Returns values like `"3:15 PM"`.
- `TimeWheelPickerJS.jsx`: Real iOS-like wheel via PickerJS loaded from CDN. Returns values like `"14:05"`.

Usage examples:

```jsx
import TimePickerIOS from './components/TimePickerIOS';
import TimeWheelPickerJS from './components/TimeWheelPickerJS';

// Flatpickr (time-only, iOS-like CSS)
<TimePickerIOS
	value={time12h}
	onChange={(v) => setTime12h(v)} // v e.g. "3:15 PM"
	placeholder="Select Time"
	minuteIncrement={5}
/>;

// PickerJS (real wheel via CDN)
<TimeWheelPickerJS
	value={time24h}
	onChange={(v) => setTime24h(v)} // v e.g. "14:05"
	placeholder="Select Time"
	hourStep={1}
	minuteStep={5}
/>;
```

Notes:
- `TimePickerIOS` uses Flatpickr already in dependencies; no extra install needed.
- `TimeWheelPickerJS` dynamically loads PickerJS from CDN (`picker.css/js`) so no changes to `package.json` are necessary.
