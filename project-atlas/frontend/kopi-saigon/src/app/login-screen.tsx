'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';

type LoginScreenProps = { onAuthenticated: () => void };

const TEST_USERNAME = 'kopi.saigon';
const TEST_PASSWORD = 'kopi.saigon.2026';

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (username === TEST_USERNAME && password === TEST_PASSWORD) {
      onAuthenticated();
      return;
    }
    setError('The username or password is incorrect. Please try again.');
  }

  return (
    <main className="prime-login-layout">
      <section className="prime-login-story" aria-label="PRIME Philippines">
        <a className="prime-login-brand" href="#login" aria-label="PRIME Philippines">
          <img className="prime-login-brand-mark" src="/logos/prime-white.png" alt="PRIME Philippines" />
        </a>

        <div className="prime-login-story-copy">
          <p className="prime-login-eyebrow">COMMERCIAL REAL ESTATE INTELLIGENCE</p>
          <h2>Data That<br />Drives Deals.</h2>
          <p className="prime-login-story-description">
            The Philippines’ leading commercial real estate platform for brokers, analysts, and property managers.
          </p>
        </div>
      </section>
      <section className="prime-login-stage" aria-label="Log in">
        <div className="prime-login-grid" aria-hidden="true" />


        <form className="prime-login-card" onSubmit={handleSubmit}>
          <p className="prime-login-card-eyebrow">WELCOME BACK</p>
          <h1>Log in</h1>
          <p className="prime-login-card-description">Enter your credentials to access your account</p>

          <label className="prime-login-label" htmlFor="prime-login-username">Username<span aria-hidden="true">*</span></label>
          <input
            className="prime-login-input"
            id="prime-login-username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="Enter your username"
            value={username}
            onChange={event => { setUsername(event.target.value); setError(''); }}
            required
          />

          <label className="prime-login-label prime-login-password-label" htmlFor="prime-login-password">Password<span aria-hidden="true">*</span></label>
          <div className="prime-login-password-field">
            <input
              className="prime-login-input"
              id="prime-login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={event => { setPassword(event.target.value); setError(''); }}
              required
            />
            <button
              className="prime-login-password-toggle"
              type="button"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(value => !value)}
            >
              {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
            </button>
          </div>

          {error && <p className="prime-login-error" role="alert">{error}</p>}
          <button className="prime-login-submit" type="submit">Log in</button>
        </form>
      </section>
    </main>
  );
}
