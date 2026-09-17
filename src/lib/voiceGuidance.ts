'use client';

const VOICE_ENABLED_KEY = 'trip_planner_voice_guidance_enabled';

class VoiceGuidanceService {
  private isEnabled: boolean = true;
  private isSpeaking: boolean = false;
  private lastSpokenText: string = '';
  private lastSpokenTime: number = 0;
  private speechQueue: string[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(VOICE_ENABLED_KEY);
      this.isEnabled = stored !== null ? stored === 'true' : true;
    }
  }

  public isVoiceEnabled(): boolean {
    return this.isEnabled;
  }

  public setVoiceEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem(VOICE_ENABLED_KEY, String(enabled));
      if (!enabled) {
        this.stop();
      }
    }
  }

  public toggleVoice(): boolean {
    this.setVoiceEnabled(!this.isEnabled);
    return this.isEnabled;
  }

  public stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.warn('Speech cancellation error:', err);
      }
    }
    this.isSpeaking = false;
    this.speechQueue = [];
  }

  /**
   * Speak a navigation instruction or safety alert.
   * Suppresses exact repeats within 8 seconds.
   */
  public speak(text: string, priority: 'normal' | 'high' = 'normal'): void {
    if (!this.isEnabled) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const cleanText = text.trim();
    if (!cleanText) return;

    const now = Date.now();
    if (this.lastSpokenText === cleanText && now - this.lastSpokenTime < 8000) {
      return;
    }

    if (priority === 'high') {
      // Clear current speech for high priority alerts (e.g. road closure or rerouting)
      this.stop();
    }

    this.speechQueue.push(cleanText);
    this.processQueue();
  }

  private processQueue(): void {
    if (this.isSpeaking || this.speechQueue.length === 0) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const textToSpeak = this.speechQueue.shift();
    if (!textToSpeak) return;

    try {
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.05; // Slightly faster, natural driving cadence
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Pick high-quality natural voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Siri'))
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      this.isSpeaking = true;
      this.lastSpokenText = textToSpeak;
      this.lastSpokenTime = Date.now();

      utterance.onend = () => {
        this.isSpeaking = false;
        setTimeout(() => this.processQueue(), 250);
      };

      utterance.onerror = (e) => {
        console.warn('Speech synthesis utterance error:', e);
        this.isSpeaking = false;
        setTimeout(() => this.processQueue(), 250);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis failed to speak:', err);
      this.isSpeaking = false;
    }
  }

  // --- Convenience Navigation Prompts ---

  public announceTarget(targetName: string, distanceKm: number, dayNumber: number): void {
    const distStr = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} meters` : `${distanceKm.toFixed(1)} kilometers`;
    const cleanName = targetName.split(',')[0];
    this.speak(`Next stop on Day ${dayNumber}: ${cleanName}, in ${distStr}`);
  }

  public announceUpcomingTurn(targetName: string, distanceMeters: number): void {
    const cleanName = targetName.split(',')[0];
    if (distanceMeters <= 50) {
      this.speak(`Arrived at ${cleanName}`);
    } else if (distanceMeters <= 500) {
      this.speak(`In 500 meters, ${cleanName}`);
    } else if (distanceMeters <= 2000) {
      this.speak(`In 2 kilometers, approach ${cleanName}`);
    }
  }

  public announceReroute(): void {
    this.speak('Off route. Recalculating route to destination.', 'high');
  }

  public announceHazard(summary: string, distanceKm: number): void {
    const distStr = distanceKm < 1 ? `${Math.round(distanceKm * 1000)} meters` : `${distanceKm.toFixed(1)} kilometers`;
    this.speak(`Caution: ${summary}, in ${distStr}`, 'high');
  }

  public announceWeatherWarning(warning: string): void {
    this.speak(`Weather Alert: ${warning}`, 'high');
  }
}

export const voiceGuidance = new VoiceGuidanceService();
