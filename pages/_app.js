
import '../styles/globals.css'
import LiveVisitorsBadge from "../components/LiveVisitorsBadge";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <LiveVisitorsBadge />
    </>
  );
}
