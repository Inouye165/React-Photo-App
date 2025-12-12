/// <reference types="vite/client" />
import React, { useState } from 'react';
import LoginForm from '../components/LoginForm';

type ViewState = 'landing' | 'login' | 'contact';

interface ContactFormState {
  name: string;
  email: string;
  interest: string;
  message: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const LandingPage: React.FC = () => {
  const [view, setView] = useState<ViewState>('landing');
  const [contactForm, setContactForm] = useState<ContactFormState>({
    name: '',
    email: '',
    interest: 'general',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/public/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactForm),
      });

      if (response.ok) {
        setSubmitStatus({ type: 'success', message: 'Message sent successfully! We will be in touch.' });
        setContactForm({ name: '', email: '', interest: 'general', message: '' });
      } else if (response.status === 429) {
        setSubmitStatus({ type: 'error', message: 'Too many requests. Please try again in an hour.' });
      } else {
        const data = await response.json().catch(() => ({}));
        setSubmitStatus({ type: 'error', message: data.error || 'Failed to send message. Please try again.' });
      }
    } catch (error) {
      setSubmitStatus({ type: 'error', message: 'Network error. Please check your connection.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBrandPanel = () => (
    <div className="relative w-full md:w-1/2 text-white p-8 flex flex-col justify-between min-h-[300px] md:min-h-screen bg-[url('/vaultage-bg.png')] bg-cover bg-center">
      <div className="absolute inset-0 bg-slate-900/80 mix-blend-multiply" />

      <div className="relative">
        <div className="inline-flex items-center px-3 py-1 mb-6 text-xs font-semibold tracking-wider text-amber-300 uppercase bg-amber-900/30 rounded-full border border-amber-800">
          Beta Access • Under Construction
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
          Vaultage
        </h1>
        <p className="text-slate-200/80 text-lg md:text-xl max-w-md">
          Secure AI-powered analysis for your most treasured memories and collectibles.
        </p>
      </div>

      <div className="relative hidden md:block text-slate-200/50 text-sm">
        &copy; {new Date().getFullYear()} Vaultage. All rights reserved.
      </div>
    </div>
  );

  const renderLandingView = () => (
    <div className="flex flex-col gap-6 w-full max-w-md animate-fade-in">
      <button
        onClick={() => setView('login')}
        className="group relative p-6 bg-white border-2 border-slate-100 rounded-xl hover:border-indigo-600 transition-all duration-300 text-left shadow-sm hover:shadow-md"
      >
        <h3 className="text-xl font-semibold text-slate-900 mb-2 group-hover:text-indigo-600">
          I have an account
        </h3>
        <p className="text-slate-500">
          Sign in to access your secure photo library.
        </p>
      </button>

      <button
        onClick={() => setView('contact')}
        className="group relative p-6 bg-slate-50 border-2 border-transparent rounded-xl hover:bg-white hover:border-emerald-500 transition-all duration-300 text-left"
      >
        <h3 className="text-xl font-semibold text-slate-900 mb-2 group-hover:text-emerald-600">
          Request Access
        </h3>
        <p className="text-slate-500">
          Interested in joining our private beta? Get in touch.
        </p>
      </button>
    </div>
  );

  const renderContactView = () => (
    <div className="w-full max-w-md animate-fade-in">
      <button
        onClick={() => setView('landing')}
        className="mb-6 text-sm text-slate-500 hover:text-slate-900 flex items-center gap-2 transition-colors"
      >
        ← Back
      </button>
      
      <h2 className="text-2xl font-bold text-slate-900 mb-6">Contact Us</h2>
      
      {submitStatus && (
        <div className={`p-4 mb-6 rounded-lg text-sm ${
          submitStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {submitStatus.message}
        </div>
      )}

      <form onSubmit={handleContactSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <input
            id="name"
            type="text"
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            value={contactForm.name}
            onChange={e => setContactForm(prev => ({ ...prev, name: e.target.value }))}
            disabled={isSubmitting}
          />
        </div>
        
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            id="email"
            type="email"
            required
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            value={contactForm.email}
            onChange={e => setContactForm(prev => ({ ...prev, email: e.target.value }))}
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label htmlFor="interest" className="block text-sm font-medium text-slate-700 mb-1">Interest</label>
          <select
            id="interest"
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-white"
            value={contactForm.interest}
            onChange={e => setContactForm(prev => ({ ...prev, interest: e.target.value }))}
            disabled={isSubmitting}
          >
            <option value="general">General Inquiry</option>
            <option value="beta">Beta Access</option>
            <option value="support">Support</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1">Message</label>
          <textarea
            id="message"
            required
            rows={4}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all resize-none"
            value={contactForm.message}
            onChange={e => setContactForm(prev => ({ ...prev, message: e.target.value }))}
            disabled={isSubmitting}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Sending...
            </>
          ) : 'Send Message'}
        </button>
      </form>
    </div>
  );

  const renderLoginView = () => (
    <div className="w-full max-w-md animate-fade-in">
      <button
        onClick={() => setView('landing')}
        className="mb-6 text-sm text-slate-500 hover:text-slate-900 flex items-center gap-2 transition-colors"
      >
        ← Back
      </button>
      <LoginForm />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {renderBrandPanel()}
      <div className="w-full md:w-1/2 p-8 md:p-12 lg:p-24 flex items-center justify-center bg-white">
        {view === 'landing' && renderLandingView()}
        {view === 'contact' && renderContactView()}
        {view === 'login' && renderLoginView()}
      </div>
    </div>
  );
};

export default LandingPage;
