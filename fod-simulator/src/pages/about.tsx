import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>About Page (`src/pages/about.tsx`)</h1>
      <p>This route was automatically generated from <code>src/pages/about.tsx</code>.</p>
      <Link to="/">← Back to Home</Link>
    </div>
  );
}
