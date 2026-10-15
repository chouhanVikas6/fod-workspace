import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>404 - Page Not Found (`src/pages/[...all].tsx`)</h1>
      <p>The page you are looking for does not exist.</p>
      <Link to="/">← Back to Home</Link>
    </div>
  );
}
