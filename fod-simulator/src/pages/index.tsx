import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Home Page (`src/pages/index.tsx`)</h1>
      <p>Welcome! Pages are now automatically generated from the <code>src/pages</code> directory, just like in Next.js!</p>
      
      <nav style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        <Link to="/about">About Page</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/users/42">User #42 (Dynamic Route)</Link>
        <Link to="/non-existent-page">404 Demo</Link>
      </nav>
    </div>
  );
}
