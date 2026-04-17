if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = this.getCartElement();
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      getCartElement() {
        // Prioritize cart-drawer over cart-notification since user expects drawer behavior
        return document.querySelector('cart-drawer') || document.querySelector('cart-notification');
      }

      waitForCartElement() {
        return new Promise((resolve) => {
          const cart = this.getCartElement();
          if (cart) {
            resolve(cart);
            return;
          }

          // If cart not found immediately, wait for DOM to be fully loaded
          const checkForCart = () => {
            const cart = this.getCartElement();
            if (cart) {
              resolve(cart);
            } else {
              // If still not found after DOM is ready, resolve with null
              // This can happen on pages where cart notification/drawer isn't rendered
              resolve(null);
            }
          };

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkForCart);
          } else {
            setTimeout(checkForCart, 50); // Small delay for dynamic content
          }
        });
      }
      
      async onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        // For ssky sections, we'll handle the cart display differently after add-to-cart
        this.isInSskySection = this.closest('[class*="ssky-text-block"]');

        // Ensure we have the cart element before proceeding
        if (!this.cart) {
          this.cart = await this.waitForCartElement();
        }

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              window.location = window.routes.cart_url;
              return;
            }

            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                cartData: response,
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    if (this.cart) {
                      this.cart.renderContents(response);
                    }
                    // Trigger Rebuy cart events
                    this.triggerRebuyCartEvents(response);
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              if (this.cart) {
                this.cart.renderContents(response);
              }
              
              // If this is from an ssky section, refresh and open the smart cart
              if (this.isInSskySection) {
                // Wait longer to let Rebuy finish its own processing
                setTimeout(() => {
                  this.refreshAndOpenSmartCart();
                }, 500);
              }
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      refreshAndOpenSmartCart(attempts = 0) {
        const maxAttempts = 20;
        
        if (window.Rebuy && window.Rebuy.Cart) {
          // Refresh cart data using available methods
          if (typeof window.Rebuy.Cart.refresh === 'function') {
            window.Rebuy.Cart.refresh();
          } else if (typeof window.Rebuy.Cart.fetchCart === 'function') {
            window.Rebuy.Cart.fetchCart();
          }
          
          // Fetch fresh cart data from Shopify and update Rebuy
          fetch('/cart.js')
            .then(response => response.json())
            .then(cartData => {
              // Update Rebuy with fresh cart data
              if (window.Rebuy.Cart.updateCart) {
                window.Rebuy.Cart.updateCart(cartData);
              } else if (window.Rebuy.Cart.setCart) {
                window.Rebuy.Cart.setCart(cartData);
              }
              
              // Trigger cart update events
              window.dispatchEvent(new CustomEvent('rebuy:cart:updated', { 
                detail: { cart: cartData } 
              }));
              
              // Open the cart
              setTimeout(() => {
                this.openSmartCart();
              }, 150);
            })
            .catch(() => {
              // Fallback: just open the cart
              setTimeout(() => {
                this.openSmartCart();
              }, 150);
            });
          
        } else if (attempts < maxAttempts) {
          // Wait for Rebuy to load
          setTimeout(() => {
            this.refreshAndOpenSmartCart(attempts + 1);
          }, 100);
        } else {
          // Fallback: open cart without Rebuy
          this.openSmartCart();
        }
      }

      openSmartCart(attempts = 0) {
        const maxAttempts = 20;
        
        // Try to find and open Rebuy Smart Cart
        if (window.Rebuy && window.Rebuy.Cart) {
          // Try different methods to show the cart
          if (typeof window.Rebuy.Cart.show === 'function') {
            window.Rebuy.Cart.show();
            return;
          } else if (typeof window.Rebuy.Cart.open === 'function') {
            window.Rebuy.Cart.open();
            return;
          } else if (typeof window.Rebuy.Cart.toggle === 'function') {
            window.Rebuy.Cart.toggle();
            return;
          }
        }
        
        // Try alternative Rebuy namespace
        if (window.rebuy && window.rebuy.cart && typeof window.rebuy.cart.show === 'function') {
          window.rebuy.cart.show();
          return;
        }
        
        // Fallback: trigger cart icon click
        const cartIcon = document.querySelector('#cart-icon-bubble, [data-cart-trigger], .cart-icon');
        if (cartIcon) {
          cartIcon.click();
          return;
        }
        
        // If Rebuy not ready yet, try again
        if (attempts < maxAttempts) {
          setTimeout(() => {
            this.openSmartCart(attempts + 1);
          }, 100);
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
