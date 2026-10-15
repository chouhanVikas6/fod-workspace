import { useParams, Link } from 'react-router-dom';

export default function UserProfile() {
  const { id } = useParams<{ id: string }>();

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>User Profile (`src/pages/users/[id].tsx`)</h1>
      <p>User ID: <strong>{id}</strong></p>
      <p>Dynamic Next.js style route parameters like <code>[id]</code> work automatically.</p>
      <Link to="/">← Back to Home</Link>
    </div>
  );
}
