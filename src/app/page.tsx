import { Providers } from "@/components/Providers";
import { Experience } from "@/components/Experience";
import { Footer, Header, Hero, Method } from "@/components/Chrome";

export default function HomePage() {
  return (
    <Providers>
      <Header />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Experience />
        <Method />
      </main>
      <Footer />
    </Providers>
  );
}
