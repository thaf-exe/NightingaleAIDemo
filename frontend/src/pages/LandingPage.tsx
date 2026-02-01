/**
 * Landing Page
 * 
 * The first page users see. Introduces Nightingale AI
 * and provides links to login/register.
 */


import { Link } from 'react-router-dom';
import { Heart, Shield, Clock, MessageCircle } from 'lucide-react';
import { Button } from '../components/ui';
import styles from './LandingPage.module.css';

export function LandingPage() {
  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <header className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.logo}>
            <Heart className={styles.logoIcon} size={40} />
            <span className={styles.logoText}>Nightingale AI</span>
          </div>
          
          <h1 className={styles.headline}>
            Your Personal Health Companion
          </h1>
          
          <p className={styles.subheadline}>
            Share your health concerns in a safe, private conversation.
            Get empathetic support and know when to see a clinician.
          </p>
          
          <div className={styles.cta}>
            <Link to="/register">
              <Button size="lg">Get Started</Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="lg">Sign In</Button>
            </Link>
          </div>
        </div>
        
        <div className={styles.heroImage}>
          <div className={styles.chatPreview}>
            <div className={styles.chatBubble}>
              <span className={styles.chatAvatar}>👤</span>
              <p>I've been having headaches for the past week...</p>
            </div>
            <div className={`${styles.chatBubble} ${styles.chatBubbleAi}`}>
              <span className={styles.chatAvatar}>🩺</span>
              <p>I'm sorry to hear that. Can you tell me more about when they occur and how severe they feel?</p>
            </div>
          </div>
        </div>
      </header>
      
      {/* Features Section */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>Why Nightingale AI?</h2>
        
        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <Shield className={styles.featureIcon} />
            <h3>Privacy First</h3>
            <p>Your health data is encrypted and never shared. We follow strict healthcare privacy standards.</p>
          </div>
          
          <div className={styles.featureCard}>
            <MessageCircle className={styles.featureIcon} />
            <h3>Empathetic Support</h3>
            <p>Our AI listens without judgment, helping you articulate your concerns clearly.</p>
          </div>
          
          <div className={styles.featureCard}>
            <Clock className={styles.featureIcon} />
            <h3>Instant Escalation</h3>
            <p>When you need human care, we connect you directly to clinic staff.</p>
          </div>
          
          <div className={styles.featureCard}>
            <Heart className={styles.featureIcon} />
            <h3>Living Memory</h3>
            <p>Your health profile updates as you chat, building a complete picture for better care.</p>
          </div>
        </div>
      </section>
      
      {/* Important Notice */}
      <section className={styles.notice}>
        <div className={styles.noticeContent}>
          <h3>Important Notice</h3>
          <p>
            Nightingale AI provides health information and support, <strong>not medical diagnoses</strong>.
            Always consult a qualified healthcare provider for medical advice, diagnosis, or treatment.
            If you're experiencing a medical emergency, call emergency services immediately.
          </p>
        </div>
      </section>
      
      {/* Footer */}
      <footer className={styles.footer}>
        <p>© 2026 Nightingale AI. Built with care for patient wellbeing.</p>
      </footer>
    </div>
  );
}

export default LandingPage;
