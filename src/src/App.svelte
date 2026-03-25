<script>
  import svelteLogo from './assets/svelte.svg'
  import viteLogo from './assets/vite.svg'
</script>

<header>
  <nav>
    <div class="logo">
      <img src={svelteLogo} alt="Cryptax logo" class="logo-icon" />
      <span>Cryptax</span>
    </div>
    <div class="nav-links">
      <a href="#features">Features</a>
      <a href="#how-it-works">How it works</a>
    </div>
  </nav>
</header>

<main>
  <section class="hero">
    <div class="hero-badges">
      <img src={svelteLogo} alt="Svelte" class="hero-icon" />
      <span class="badge">+</span>
      <img src={viteLogo} alt="Vite" class="hero-icon" />
    </div>
    <h1>Cryptax</h1>
    <p class="tagline">
      Local-first cryptocurrency tax calculator.<br />
      Your keys, your data, your taxes — computed entirely in your browser.
    </p>
    <div class="cta-group">
      <button class="cta-primary">Get started</button>
      <button class="cta-secondary">Learn more</button>
    </div>
  </section>

  <section id="features" class="features">
    <h2>Features</h2>
    <div class="feature-grid">
      <div class="feature-card">
        <h3>Privacy first</h3>
        <p>All calculations run locally in your browser. Your transaction data never leaves your device.</p>
      </div>
      <div class="feature-card">
        <h3>Multi-jurisdiction</h3>
        <p>Country-specific tax rules with support for different income types, brackets, and loss deductions.</p>
      </div>
      <div class="feature-card">
        <h3>Exchange imports</h3>
        <p>Import transaction history from major exchanges. Custom importers handle each format automatically.</p>
      </div>
      <div class="feature-card">
        <h3>Precise calculations</h3>
        <p>Arbitrary-precision arithmetic ensures your tax figures are accurate down to the last satoshi.</p>
      </div>
    </div>
  </section>

  <section id="how-it-works" class="how-it-works">
    <h2>How it works</h2>
    <div class="steps">
      <div class="step">
        <span class="step-number">1</span>
        <h3>Import</h3>
        <p>Upload your exchange CSV exports or enter transactions manually.</p>
      </div>
      <div class="step">
        <span class="step-number">2</span>
        <h3>Configure</h3>
        <p>Select your country and tax year. Rules are applied automatically.</p>
      </div>
      <div class="step">
        <span class="step-number">3</span>
        <h3>Calculate</h3>
        <p>Get a full breakdown of gains, losses, and estimated tax per income type.</p>
      </div>
    </div>
  </section>
</main>

<footer>
  <p>Cryptax — open-source crypto tax calculator</p>
</footer>

<style>
  header {
    border-bottom: 1px solid var(--border);
  }

  nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    max-width: 1060px;
    margin: 0 auto;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--heading);
    font-size: 20px;
    font-weight: 600;
    color: var(--text-h);
  }

  .logo-icon {
    height: 28px;
    width: 28px;
  }

  .nav-links {
    display: flex;
    gap: 24px;
  }

  .nav-links a {
    color: var(--text);
    text-decoration: none;
    font-size: 15px;
    transition: color 0.2s;
  }

  .nav-links a:hover {
    color: var(--text-h);
  }

  main {
    max-width: 1060px;
    margin: 0 auto;
    padding: 0 32px;
  }

  .hero {
    text-align: center;
    padding: 80px 0 64px;
  }

  .hero-badges {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  .hero-icon {
    height: 36px;
    width: 36px;
  }

  .badge {
    color: var(--text);
    font-size: 20px;
    font-weight: 300;
  }

  h1 {
    font-size: 64px;
    letter-spacing: -2px;
    margin: 0 0 16px;
    color: var(--text-h);
  }

  .tagline {
    font-size: 18px;
    line-height: 1.6;
    color: var(--text);
    max-width: 520px;
    margin: 0 auto 40px;
  }

  .cta-group {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .cta-primary,
  .cta-secondary {
    font-family: var(--sans);
    font-size: 15px;
    padding: 10px 24px;
    border-radius: 8px;
    cursor: pointer;
    transition: box-shadow 0.2s, background 0.2s;
  }

  .cta-primary {
    background: var(--accent);
    color: #fff;
    border: none;
  }

  .cta-primary:hover {
    box-shadow: var(--shadow);
  }

  .cta-secondary {
    background: transparent;
    color: var(--text-h);
    border: 1px solid var(--border);
  }

  .cta-secondary:hover {
    background: var(--social-bg);
  }

  .features,
  .how-it-works {
    padding: 64px 0;
    border-top: 1px solid var(--border);
  }

  .features h2,
  .how-it-works h2 {
    text-align: center;
    margin-bottom: 40px;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }

  .feature-card {
    background: var(--social-bg);
    border-radius: 10px;
    padding: 24px;
    text-align: left;
  }

  .feature-card h3 {
    font-family: var(--heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--text-h);
    margin: 0 0 8px;
  }

  .feature-card p {
    font-size: 15px;
    line-height: 1.5;
    color: var(--text);
    margin: 0;
  }

  .steps {
    display: flex;
    gap: 24px;
  }

  .step {
    flex: 1;
    text-align: center;
    padding: 24px;
  }

  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
    font-size: 15px;
    margin-bottom: 16px;
    border: 1px solid var(--accent-border);
  }

  .step h3 {
    font-family: var(--heading);
    font-size: 17px;
    font-weight: 600;
    color: var(--text-h);
    margin: 0 0 8px;
  }

  .step p {
    font-size: 15px;
    line-height: 1.5;
    color: var(--text);
    margin: 0;
  }

  footer {
    border-top: 1px solid var(--border);
    padding: 24px 32px;
    text-align: center;
    font-size: 14px;
    color: var(--text);
  }

  @media (max-width: 768px) {
    .hero {
      padding: 48px 0 40px;
    }

    h1 {
      font-size: 40px;
    }

    .feature-grid {
      grid-template-columns: 1fr;
    }

    .steps {
      flex-direction: column;
    }

    .nav-links {
      display: none;
    }
  }
</style>
