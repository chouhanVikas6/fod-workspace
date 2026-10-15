import { Link } from 'react-router-dom';

export default function Dashboard() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Dashboard (`src/pages/dashboard/index.tsx`)</h1>
      <p>Nested folder routes work seamlessly!</p>
      <Link to="/">← Back to Home</Link>
    </div>
  );
}
