const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export class SpeechInput {
  constructor({ onResult, onInterim, onError } = {}) {
    this.onResult = onResult || (() => {});
    this.onInterim = onInterim || (() => {});
    this.onError = onError || (() => {});
    this._recognition = null;
  }

  static isSupported() {
    return !!SpeechRecognition;
  }

  isListening() {
    return this._recognition !== null;
  }

  start() {
    if (this._recognition) return;
    const r = new SpeechRecognition();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false;

    r.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) {
        this.stop();
        this.onResult(final.trim());
      } else if (interim) {
        this.onInterim(interim);
      }
    };

    r.onerror = (e) => {
      this._recognition = null;
      if (e.error === "aborted") return;
      const msgs = {
        "not-allowed": "Доступ к микрофону запрещён",
        "no-speech": "Речь не обнаружена",
        "network": "Ошибка сети распознавания речи"
      };
      this.onError(msgs[e.error] || `Ошибка: ${e.error}`);
    };

    r.onend = () => { this._recognition = null; };

    this._recognition = r;
    r.start();
  }

  stop() {
    if (this._recognition) {
      this._recognition.stop();
      this._recognition = null;
    }
  }
}
