import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

const PROMO_POSTERS = [
  { src: "/poster-support.png", alt: "Fast withdrawals and 24/7 support service" },
  { src: "/poster-trusted.png", alt: "Trusted platform — safe, secure, reliable" },
];

function PosterSlider() {
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % PROMO_POSTERS.length);
    }, 2000);

    return () => window.clearInterval(timer);
  }, []);

  function showPrevious() {
    setActiveSlide((current) => (current - 1 + PROMO_POSTERS.length) % PROMO_POSTERS.length);
  }

  function showNext() {
    setActiveSlide((current) => (current + 1) % PROMO_POSTERS.length);
  }

  function handleTouchEnd(event) {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(distance) > 40) {
      if (distance < 0) showNext();
      else showPrevious();
    }
    touchStartX.current = null;
  }

  return (
    <section
      aria-label="Promotional posters"
      aria-roledescription="carousel"
      className="relative overflow-hidden rounded-2xl border border-[#f41468]/50 bg-[#10001f] shadow-[0_0_22px_rgba(244,20,104,.18)]"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0].clientX;
      }}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="flex transition-transform duration-700 ease-in-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${activeSlide * 100}%)` }}
      >
        {PROMO_POSTERS.map((poster) => (
          <div key={poster.src} className="w-full shrink-0">
            <img src={poster.src} alt={poster.alt} className="block h-auto w-full" />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={showPrevious}
        aria-label="Show previous poster"
        className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#10001f]/75 text-xl font-bold text-white shadow-md transition hover:bg-[#f41468] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={showNext}
        aria-label="Show next poster"
        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#10001f]/75 text-xl font-bold text-white shadow-md transition hover:bg-[#f41468] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      >
        ›
      </button>

      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2">
        {PROMO_POSTERS.map((poster, index) => (
          <button
            key={poster.src}
            type="button"
            onClick={() => setActiveSlide(index)}
            aria-label={`Show poster ${index + 1}`}
            aria-current={activeSlide === index ? "true" : undefined}
            className={`h-2 rounded-full shadow transition-all ${
              activeSlide === index ? "w-5 bg-[#55baff]" : "w-2 bg-white/70"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

function GameCard({ title, image, onPlay, href, disabled = false, className = "" }) {
  return (
    <article className={`relative flex aspect-square min-w-0 overflow-hidden rounded-2xl border border-gray-100 shadow-card ${className}`} data-purpose="game-card">
      <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open WhatsApp support"
          className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#55baff]"
        />
      ) : (
        <button
          type="button"
          onClick={onPlay}
          disabled={disabled}
          aria-label={`Play ${title}`}
          className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#55baff] disabled:cursor-not-allowed"
        />
      )}
    </article>
  );
}

export default function Home() {
  const navigate = useNavigate();

  const supportSettings = useQuery({
    queryKey: ["settings", "public"],
    queryFn: () => api("/settings/public"),
    staleTime: 5 * 60_000,
  });
  const supportNumber = supportSettings.data?.supportWhatsapp?.replace(/\D/g, "");
  const supportMessage = encodeURIComponent("Hello Proboss Ludo support, I need help with my account.");
  const supportWhatsappUrl = supportNumber
    ? `https://wa.me/${supportNumber}?text=${supportMessage}`
    : `https://wa.me/?text=${supportMessage}`;

  return (
    <div className="flex flex-col gap-4">
      <section
        className="mt-2 rounded-xl border border-[#f41468] bg-gradient-to-r from-[#25103b] via-[#1a082a] to-[#321043] p-3.5 shadow-[0_0_18px_rgba(244,20,104,.14)]"
        data-purpose="promo-banner"
      >
        <div className="space-y-1.5 text-center text-[12px] font-bold leading-relaxed tracking-tight text-white sm:text-[13px]">
          <p>
            Proboss Ludo वेबसाइट पर आपका हार्दिक स्वागत है, दोस्तों। Proboss Ludo वेबसाइट पर आपका विश्वास कभी नहीं तोड़ा जाएगा 🙏
          </p>
          <p>
            दोस्तों, Withdrawal में कोई प्रोब्लम नहीं है (Super Fast Withdrawal ⏩)।
          </p>
          <p>
            👉 दोस्तों, डिपॉजिट ऐड करने में किसी भी प्रकार की समस्या हो तो सपोर्ट पर संपर्क करें 🙏 (24×7 Support)
          </p>
          {supportNumber ? (
            <a
              href={supportWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-extrabold text-[#55baff] underline decoration-[#f41468] underline-offset-2"
            >
              🙏 Support no ☎️ +{supportNumber}
            </a>
          ) : (
            <p className="font-extrabold text-[#55baff]">🙏 Support no ☎️</p>
          )}
        </div>
      </section>

      <div className="flex items-center gap-3 py-1">
        <span aria-hidden="true" className="tournament-heading-line">
          <span />
        </span>
        <h2 className="text-2xl font-black tracking-tight text-ink-soft">Our Tournaments</h2>
        <span aria-hidden="true" className="tournament-heading-line">
          <span />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 items-start gap-3">
        <GameCard
          title="Classic Web Ludo"
          image="/tournament-classic.png"
          onPlay={() => navigate("/play")}
        />
        <GameCard
          title="WhatsApp Support"
          image="/tournament-support.png"
          href={supportWhatsappUrl}
        />
      </div>

      <PosterSlider />
    </div>
  );
}
