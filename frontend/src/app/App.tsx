import styles from './App.module.css';

export default function App() {
  return (
    <div className={styles.app}>
      <h1 className="sr-only">제주 안전지도</h1>
      <main className={styles.map} aria-label="지도" />
    </div>
  );
}
