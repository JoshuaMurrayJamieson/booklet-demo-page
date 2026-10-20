/* ==========================================================================
   Free booklet page — behaviour (AWS version)

   Sends each request to the AWS API (POST /requests). The server makes every
   real decision: validation, bot checks, rate limits, saving, emailing.
   The checks in this file are only there to help real people fix mistakes
   before they press the button. Never rely on them for security: anyone can
   skip this page and call the API directly.

   Until API_URL is filled in, the page runs in DEMO MODE: it works on screen
   but sends nothing.
   ========================================================================== */

// --- Settings -----------------------------------------------------------------

// The ApiUrl output from "sam deploy", e.g. https://abc123.execute-api.ap-southeast-2.amazonaws.com
// No slash at the end. Leave empty for demo mode.
const API_URL = 'https://4gd0180a2k.execute-api.ap-southeast-2.amazonaws.com';

// Which booklet this page offers. Must be a code in src/shared/booklets.mjs.
const BOOKLET = 'ME';

// --- Page setup -----------------------------------------------------------------

const isConnected = API_URL !== '';
const pageLoadedAt = Date.now();

const form = document.getElementById('request-form');
const submitButton = document.getElementById('submit-button');
const statusMessage = document.getElementById('form-status');
const buttonLabel = submitButton.textContent;

document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('demo-flag').hidden = isConnected;

// If the logo or cover can't load, show the built-in stand-in instead of a broken image.
document.querySelectorAll('img[data-fallback]').forEach((img) => {
  const showFallback = () => {
    img.hidden = true;
    document.getElementById(img.dataset.fallback).hidden = false;
  };
  if (img.complete && img.naturalWidth === 0) showFallback();
  else img.addEventListener('error', showFallback);
});

// Ad tracking tags from the page address (e.g. ?utm_source=facebook&utm_campaign=me_oct).
// The server keeps only short, plain values and drops anything else.
const params = new URLSearchParams(window.location.search);
const utm = {};
['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach((key) => {
  if (params.get(key)) utm[key] = params.get(key).slice(0, 100);
});

// --- Field errors ---------------------------------------------------------------------

// Maps the field names the server uses to the error element on this page.
const ERROR_ELEMENTS = {
  email: { input: 'email', error: 'email-error' },
  firstName: { input: 'first-name', error: 'first-name-error' },
  country: { input: 'country', error: 'country-error' },
  turnstileToken: { input: null, error: 'turnstile-error' },
};

function showFieldError(field, message) {
  const target = ERROR_ELEMENTS[field];
  if (!target) return;
  const error = document.getElementById(target.error);
  error.textContent = message || '';
  error.hidden = !message;
  if (target.input) {
    document.getElementById(target.input).setAttribute('aria-invalid', message ? 'true' : 'false');
  }
}

function clearAllErrors() {
  Object.keys(ERROR_ELEMENTS).forEach((field) => showFieldError(field, ''));
  statusMessage.hidden = true;
}

// Same rules as the server (src/shared/validate.mjs), so people get instant feedback.
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@.]{2,63}$/;
const NAME_PATTERN = /^[\p{L}\p{M}' .-]{1,40}$/u;
const LOOKS_LIKE_A_DOMAIN = /[\p{L}\p{M}]{2,}\.[\p{L}\p{M}]{2,}/u;

/** Returns a map of field → message for anything a person needs to fix. */
function checkFields(data) {
  const errors = {};
  if (!EMAIL_PATTERN.test(data.email)) errors.email = 'Enter your email address, like name@example.com';
  if (data.firstName && (!NAME_PATTERN.test(data.firstName) || LOOKS_LIKE_A_DOMAIN.test(data.firstName))) {
    errors.firstName = 'Use letters only for your first name, up to 40 characters';
  }
  if (!data.country) errors.country = 'Choose your country';
  if (isConnected && !data.turnstileToken) errors.turnstileToken = 'Complete the check that you’re not a robot';
  return errors;
}

// --- Sending -------------------------------------------------------------------------------

function showThanks(email) {
  document.getElementById('form-view').hidden = true;
  document.getElementById('thanks-email').textContent = email; // textContent: never treated as HTML
  document.getElementById('demo-note').hidden = isConnected;
  document.getElementById('thanks').hidden = false;

  const title = document.getElementById('thanks-title');
  title.focus({ preventScroll: true });
  title.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function showProblem(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
  submitButton.disabled = false;
  submitButton.textContent = buttonLabel;
  // Turnstile tokens work once only, so get a fresh one for the next attempt.
  if (window.turnstile) window.turnstile.reset();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAllErrors();

  const data = {
    email: form.elements.email.value.trim(),
    firstName: form.elements.firstName.value.trim(),
    country: form.elements.country.value,
    booklet: BOOKLET,
    stayInTouch: form.elements.stayInTouch.checked,
    website: form.elements.website.value,                  // bot trap; the server checks it
    elapsedMs: Date.now() - pageLoadedAt,                   // the server checks this too
    // Turnstile adds this hidden field to the form once the check is passed.
    turnstileToken: form.querySelector('[name="cf-turnstile-response"]')?.value || '',
    utm,
  };

  const errors = checkFields(data);
  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([field, message]) => showFieldError(field, message));
    const first = Object.keys(errors).map((f) => ERROR_ELEMENTS[f].input).find(Boolean);
    if (first) document.getElementById(first).focus();
    return;
  }

  if (!isConnected) {
    showThanks(data.email); // demo mode
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Sending…';

  let response;
  try {
    response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    showProblem('Your request didn’t go through. Check your internet connection and try again.');
    return;
  }

  const result = await response.json().catch(() => ({}));

  if (response.ok) {
    showThanks(data.email);
  } else if (response.status === 400 && result.errors) {
    Object.entries(result.errors).forEach(([field, message]) => showFieldError(field, message));
    showProblem('Check the highlighted details and try again.');
  } else {
    // 400 with a message (e.g. robot check), 429 (too many), 500 (our side).
    showProblem(result.message || 'Something went wrong. Please try again in a few minutes.');
  }
});
