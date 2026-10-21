"use client";
import { useRef, useEffect } from "react";
import { TradeProvider, useTrade } from "./TradeContext";
import Step1Details from "./steps/Step1Details";
import Step2Negotiation from "./steps/Step2Negotiation";
import Step3Review from "./steps/Step3Review";
import Link from "next/link";

const STEPS = [
  { index: 1, label: "Details" },
  { index: 2, label: "Negotiation" },
  { index: 3, label: "Review" },
];

function StepIndicator() {
  const { step } = useTrade();
  return (
    <div 
      className="flex items-center gap-0 mb-8" 
      role="doc-pagebreak"
      aria-label={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]?.label}`}
    >
      {STEPS.map(({ index, label }, i) => (
        <div key={index} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                step === index
                  ? "bg-gold text-text-inverse"
                  : step > index
                  ? "bg-emerald text-text-inverse"
                  : "bg-bg-elevated text-text-muted border border-border-default"
              }`}
              aria-current={step === index ? "step" : undefined}
            >
              {step > index ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                index
              )}
            </div>
            <span className={`text-xs ${step >= index ? "text-text-secondary" : "text-text-muted"}`}>
              {label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px mx-2 mb-4 transition-colors ${step > index ? "bg-emerald" : "bg-border-default"}`} aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}

function CreateTradeInner() {
  const { step } = useTrade();
  const formRef = useRef<HTMLDivElement>(null);

  // Focus management: Move focus to the form content when step changes
  useEffect(() => {
    if (formRef.current) {
      // Announce the step change and focus on the form area
      const heading = formRef.current.querySelector("h2");
      if (heading) {
        heading.focus();
      }
    }
  }, [step]);

  return (
    <div className="min-h-screen bg-bg-primary flex items-start justify-center px-4 py-12">
      {/* Skip to main content link */}
      <a 
        href="#main-form" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:bg-gold focus:text-text-inverse focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to form content
      </a>

      <div className="w-full max-w-lg">
        <div className="mb-6">
          <Link 
            href="/" 
            className="text-text-muted text-sm hover:text-text-secondary transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold focus-visible:rounded"
          >
            ← Back
          </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Create Trade</h1>
          <p className="text-text-secondary text-sm mt-1">
            Lock agricultural commodity value into cNGN escrow via NGN Path Payment
          </p>
        </div>

        <div 
          id="main-form"
          className="bg-bg-card rounded-xl border border-border-default p-6 shadow-card"
          ref={formRef}
          role="region"
          aria-label="Trade creation form"
        >
          <StepIndicator />
          
          {step === 1 && (
            <>
              <h2 className="sr-only" tabIndex={-1}>Step 1: Trade Details</h2>
              <Step1Details />
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="sr-only" tabIndex={-1}>Step 2: Negotiation Terms</h2>
              <Step2Negotiation />
            </>
          )}
          {step === 3 && (
            <>
              <h2 className="sr-only" tabIndex={-1}>Step 3: Review and Confirm</h2>
              <Step3Review />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateTradePage() {
  return (
    <TradeProvider>
      <CreateTradeInner />
    </TradeProvider>
  );
}
