/**
 * Back in Stock - Klaviyo Integration
 * Custom element for handling back-in-stock notifications via Klaviyo
 */

if (!customElements.get('back-in-stock')) {
  class BackInStock extends HTMLElement {
    constructor() {
      super();

      // Configuration - UPDATE THIS WITH YOUR KLAVIYO COMPANY ID
      this.klaviyoCompanyId = 'Vv3cEp'; // TODO: Replace with your actual Klaviyo company ID

      // Cache elements
      this.form = this.querySelector('[js-form]');
      this.emailInput = this.querySelector('[js-email]');
      this.variantIdInput = this.querySelector('[js-variant-id]');
      this.submitBtn = this.querySelector('[js-submit-btn]');
      this.loadingSpinner = this.querySelector('[js-loading-spinner]');
      this.btnText = this.querySelector('[js-btn-text]');
      this.messageDiv = this.querySelector('[js-message]');

      this.init();
    }

    init() {
      this.bindEvents();
    }

    bindEvents() {
      // Form events
      if (this.form) {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
      }

      if (this.emailInput) {
        this.emailInput.addEventListener('input', (e) => this.validateEmail(e));
      }
    }

    // Form functionality
    resetForm() {
      if (this.form) {
        this.form.reset();
      }
      if (this.messageDiv) {
        this.messageDiv.style.display = 'none';
        this.messageDiv.classList.remove('success', 'error');
      }
      if (this.emailInput) {
        this.emailInput.style.borderColor = '';
      }
      this.resetFormState();
    }

    resetFormState() {
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
      }
      if (this.loadingSpinner) {
        this.loadingSpinner.style.display = 'none';
      }
      if (this.btnText) {
        this.btnText.textContent = this.btnText.getAttribute('data-original-text') || 'Notify Me When Available';
      }
    }

    setLoadingState() {
      if (this.submitBtn) {
        this.submitBtn.disabled = true;
      }
      if (this.loadingSpinner) {
        this.loadingSpinner.style.display = 'inline-block';
      }
      if (this.btnText) {
        // Store original text
        if (!this.btnText.getAttribute('data-original-text')) {
          this.btnText.setAttribute('data-original-text', this.btnText.textContent);
        }
        this.btnText.textContent = 'Subscribing...';
      }
    }

    showMessage(text, type) {
      if (this.messageDiv) {
        this.messageDiv.textContent = text;
        this.messageDiv.classList.remove('success', 'error');
        this.messageDiv.classList.add(type);
        this.messageDiv.style.display = 'block';

        if (type === 'success') {
          // Reset form after showing success message
          setTimeout(() => {
            if (this.messageDiv) {
              this.messageDiv.style.display = 'none';
            }
            this.resetForm();
          }, 5000);
        }
      }
    }

    // Validation
    isValidEmail(email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    validateEmail(e) {
      const email = e.target.value.trim();
      if (email && !this.isValidEmail(email)) {
        e.target.style.borderColor = '#f44336';
      } else if (email) {
        e.target.style.borderColor = '#4caf50';
      } else {
        e.target.style.borderColor = '';
      }
    }

    // Variant ID formatting for Klaviyo
    formatVariantIdForKlaviyo(variantId) {
      if (variantId.includes('$shopify:::$default:::')) {
        return variantId;
      }
      return `$shopify:::$default:::${variantId}`;
    }

    // Form submission
    async handleSubmit(e) {
      e.preventDefault();

      const email = this.emailInput.value.trim();
      const rawVariantId = this.variantIdInput.value.trim();

      // Validation
      if (!this.isValidEmail(email)) {
        this.showMessage('Please enter a valid email address.', 'error');
        return;
      }

      if (!rawVariantId) {
        this.showMessage('Variant ID is required.', 'error');
        return;
      }

      // Check if Klaviyo company ID is configured
      if (this.klaviyoCompanyId === 'YOUR_KLAVIYO_COMPANY_ID') {
        console.error('Klaviyo company ID not configured. Please update the back-in-stock.js file.');
        this.showMessage('Configuration error. Please contact support.', 'error');
        return;
      }

      const variantId = this.formatVariantIdForKlaviyo(rawVariantId);
      this.setLoadingState();

      try {
        const response = await fetch(
          `https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=${this.klaviyoCompanyId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              revision: '2024-06-15',
            },
            body: JSON.stringify({
              data: {
                type: 'back-in-stock-subscription',
                attributes: {
                  profile: {
                    data: {
                      type: 'profile',
                      attributes: {
                        email: email,
                      },
                    },
                  },
                  channels: ['EMAIL'],
                },
                relationships: {
                  variant: {
                    data: {
                      type: 'catalog-variant',
                      id: variantId,
                    },
                  },
                },
              },
            }),
          }
        );

        if (response.status === 201 || response.status === 202) {
          this.showMessage("Great! You'll be notified when this item is back in stock.", 'success');
          this.form.reset();

          // Track successful subscription
          if (window.dataLayer) {
            window.dataLayer.push({
              event: 'back_in_stock_subscription',
              variant_id: rawVariantId,
            });
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          let errorMessage = 'Something went wrong. Please try again.';

          if (errorData.errors && errorData.errors.length > 0) {
            errorMessage = errorData.errors[0].detail || errorMessage;
          }

          console.error('Klaviyo API error:', errorData);
          this.showMessage(errorMessage, 'error');
        }
      } catch (error) {
        console.error('Network error:', error);
        this.showMessage('Network error. Please check your connection and try again.', 'error');
      } finally {
        this.resetFormState();
      }
    }

    // Update variant when product variant changes
    updateVariant(variantId) {
      if (this.variantIdInput) {
        this.variantIdInput.value = variantId;
      }
    }
  }

  customElements.define('back-in-stock', BackInStock);
}

// Listen for variant changes
document.addEventListener('DOMContentLoaded', () => {
  // Subscribe to variant change events
  if (typeof window.PubSub !== 'undefined') {
    window.PubSub.subscribe('variant:change', (event) => {
      const backInStockElement = document.querySelector('back-in-stock');
      if (backInStockElement && event.variant) {
        backInStockElement.updateVariant(event.variant.id);
      }
    });
  }
});
