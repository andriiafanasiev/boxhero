// Локальний кошик з синхронізацією через localStorage
class LocalCart {
  constructor() {
    this.storageKey = 'boxhero_local_cart';
    this.cart = this.loadCart();
    this.init();
  }

  loadCart() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  saveCart() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.cart));
    this.updateCartUI();
    this.dispatchCartUpdate();
  }

  dispatchCartUpdate() {
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: this.cart }));
  }

  addItem(product) {
    // Перевіряємо, чи передано всі необхідні дані
    if (!product) {
      console.error('LocalCart: addItem отримав undefined/null');
      this.showNotification('Помилка: некоректні дані товару');
      return;
    }
    
    if (!product.variantId) {
      console.error('LocalCart: addItem отримав товар без variantId', product);
      this.showNotification('Помилка: не вдалося додати товар');
      return;
    }
    
    // Перетворюємо variantId на рядок для консистентності
    const productVariantId = String(product.variantId || '');
    
    // Нормалізуємо selectedOptions для порівняння
    const normalizeOptions = (options) => {
      if (!options || typeof options !== 'object') return {};
      const normalized = {};
      Object.keys(options).sort().forEach(key => {
        if (options[key] && options[key] !== '' && options[key] !== 'null') {
          normalized[key] = String(options[key]).trim();
        }
      });
      // Додаємо спеціальні поля для порівняння
      if (options.packageVariant) normalized.packageVariant = String(options.packageVariant).trim();
      if (options.size) normalized.size = String(options.size).trim();
      if (options.color) normalized.color = String(options.color).trim();
      return normalized;
    };
    
    const productOptions = normalizeOptions(product.selectedOptions || {});
    
    // Шукаємо ідентичний товар (той самий variantId та опції)
    const existingIndex = this.cart.findIndex(item => {
      const itemVariantId = String(item.variantId || '');
      const itemOptions = normalizeOptions(item.selectedOptions);
      
      // Порівнюємо variantId
      if (itemVariantId !== productVariantId) return false;
      
      // Порівнюємо опції
      const productKeys = Object.keys(productOptions).sort();
      const itemKeys = Object.keys(itemOptions).sort();
      
      if (productKeys.length !== itemKeys.length) return false;
      
      return productKeys.every(key => productOptions[key] === itemOptions[key]);
    });

    if (existingIndex > -1) {
      // Якщо знайшли ідентичний товар, збільшуємо кількість
      this.cart[existingIndex].quantity += product.quantity || 1;
      this.showNotification('Кількість товару оновлено');
    } else {
      // Якщо не знайшли, додаємо новий товар
      this.cart.push({
        ...product,
        variantId: productVariantId,
        selectedOptions: productOptions,
        quantity: product.quantity || 1,
        id: Date.now() + Math.random()
      });
      this.showNotification('Товар додано до кошика');
    }

    this.saveCart();
  }

  removeItem(itemId) {
    this.cart = this.cart.filter(item => item.id !== itemId);
    this.saveCart();
  }

  updateQuantity(itemId, quantity) {
    const item = this.cart.find(item => item.id === itemId);
    if (item) {
      if (quantity <= 0) {
        this.removeItem(itemId);
      } else {
        item.quantity = quantity;
        this.saveCart();
      }
    }
  }

  getTotal() {
    return this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }

  getTotalItems() {
    return this.cart.reduce((sum, item) => sum + item.quantity, 0);
  }

  clear() {
    this.cart = [];
    this.saveCart();
  }

  isProductPage() {
    // Перевіряємо, чи це сторінка товару
    const ogType = document.querySelector('meta[property="og:type"]');
    if (ogType && ogType.content === 'product') {
      return true;
    }
    
    // Перевіряємо через pageType в атрибутах
    const pageTypeElements = document.querySelectorAll('[data-page-type], [style*="pageType"]');
    for (const el of pageTypeElements) {
      const pageType = el.getAttribute('data-page-type') || 
                      (el.getAttribute('style')?.includes('pageType:GP_PRODUCT') ? 'GP_PRODUCT' : null);
      if (pageType === 'GP_PRODUCT') {
        return true;
      }
    }
    
    // Перевіряємо URL
    if (window.location.pathname.includes('/products/')) {
      return true;
    }
    
    return false;
  }

  init() {
    // Перехоплюємо форми додавання до кошика ТІЛЬКИ на сторінках товарів
    document.addEventListener('submit', (e) => {
      const form = e.target.closest('form[action*="/cart/add"]');
      if (form && !form.dataset.localCartProcessed && this.isProductPage()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        form.dataset.localCartProcessed = 'true';
        this.handleAddToCart(form);
        setTimeout(() => {
          form.dataset.localCartProcessed = '';
        }, 500);
        return false;
      }
    }, true);

    // Перехоплюємо кліки на кнопки додавання до кошика ТІЛЬКИ на сторінках товарів
    document.addEventListener('click', (e) => {
      if (!this.isProductPage()) return;
      
      // Перевіряємо, чи клік був саме на кнопку submit або всередині неї
      const button = e.target.closest('button[type="submit"][name="add"], button[type="submit"].gp-button-atc, button.gp-button-atc, button[data-add-to-cart], .add-to-cart-button');
      
      // Також перевіряємо кліки на gp-product-button або всередині нього
      const gpProductButton = e.target.closest('gp-product-button');
      
      if (button || gpProductButton) {
        let form = null;
        
        if (button) {
          // Шукаємо форму, пов'язану з кнопкою
          form = button.closest('form[action*="/cart/add"]') || 
                 button.closest('product-form')?.querySelector('form[action*="/cart/add"]') ||
                 button.closest('gp-product-button')?.closest('product-form')?.querySelector('form[action*="/cart/add"]');
        }
        
        // Якщо клік на gp-product-button, шукаємо форму в тому ж gp-product
        if (!form && gpProductButton) {
          const gpProduct = gpProductButton.closest('gp-product');
          if (gpProduct) {
            form = gpProduct.querySelector('form[action*="/cart/add"]') ||
                   gpProduct.querySelector('product-form')?.querySelector('form[action*="/cart/add"]');
          }
        }
        
        // Якщо все ще не знайшли, шукаємо будь-яку форму на сторінці
        if (!form) {
          form = document.querySelector('form[action*="/cart/add"]');
        }
        
        if (form && !form.dataset.localCartProcessed) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          form.dataset.localCartProcessed = 'true';
          this.handleAddToCart(form);
          setTimeout(() => {
            form.dataset.localCartProcessed = '';
          }, 500);
          return false;
        }
      }
    }, true);

    // Додатково: перехоплюємо всі кліки всередині форм додавання до кошика ТІЛЬКИ на сторінках товарів
    setTimeout(() => {
      if (this.isProductPage()) {
        const forms = document.querySelectorAll('form[action*="/cart/add"]');
        forms.forEach(form => {
          // Видаляємо onclick="return false;" якщо є
          const submitBtn = form.querySelector('button[type="submit"][onclick*="return false"]');
          if (submitBtn) {
            submitBtn.removeAttribute('onclick');
          }

          // Додаємо обробник безпосередньо на форму
          form.addEventListener('submit', (e) => {
            if (!form.dataset.localCartProcessed) {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              form.dataset.localCartProcessed = 'true';
              this.handleAddToCart(form);
              setTimeout(() => {
                form.dataset.localCartProcessed = '';
              }, 500);
              return false;
            }
          }, true);
        });
        
        // Додаємо обробники на gp-product-button елементи
        const gpProductButtons = document.querySelectorAll('gp-product-button');
        gpProductButtons.forEach(gpButton => {
          // Знаходимо форму, пов'язану з цією кнопкою
          const gpProduct = gpButton.closest('gp-product');
          let form = null;
          if (gpProduct) {
            form = gpProduct.querySelector('form[action*="/cart/add"]') ||
                   gpProduct.querySelector('product-form')?.querySelector('form[action*="/cart/add"]');
          }
          if (!form) {
            form = document.querySelector('form[action*="/cart/add"]');
          }
          
          if (form) {
            // Додаємо обробник на клік по gp-product-button
            gpButton.addEventListener('click', (e) => {
              // Перевіряємо, чи клік не на disabled елементі
              const button = e.target.closest('button');
              if (button && (button.disabled || button.classList.contains('disabled'))) {
                return;
              }
              
              if (!form.dataset.localCartProcessed) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                form.dataset.localCartProcessed = 'true';
                this.handleAddToCart(form);
                setTimeout(() => {
                  form.dataset.localCartProcessed = '';
                }, 500);
                return false;
              }
            }, true);
          }
        });
        
        // Слухаємо зміни варіантів (розміру) на сторінці товару
        this.watchVariantChanges();
      } else {
        // На головній сторінці: перетворюємо форми на посилання на сторінки товарів
        this.convertHomepageFormsToLinks();
      }
    }, 100);

    // Слухаємо оновлення кошика з інших вкладок
    window.addEventListener('storage', (e) => {
      if (e.key === this.storageKey) {
        this.cart = this.loadCart();
        this.updateCartUI();
      }
    });

    window.addEventListener('cartUpdated', () => {
      this.updateCartUI();
    });

    this.createCartUI();
    this.updateCartUI();
  }

  handleAddToCart(form) {
    try {
      // СПОЧАТКУ витягуємо актуальний variantId з gp-context/gp-data (найточніші дані)
      let variantId = null;
      // Шукаємо gp-product елемент (може бути батьківським для product-form або самою формою)
      let gpProduct = form.closest('gp-product');
      if (!gpProduct) {
        const productForm = form.closest('product-form');
        if (productForm) {
          gpProduct = productForm.closest('gp-product');
        }
      }
      
      if (gpProduct) {
        const gpContext = gpProduct.getAttribute('gp-context');
        const gpData = gpProduct.getAttribute('gp-data');
        
        try {
          if (gpContext) {
            // Декодуємо HTML entities перед парсингом
            const decodedContext = this.decodeHtmlEntities(gpContext);
            const context = JSON.parse(decodedContext);
            if (context.variantSelected && context.variantSelected.id) {
              variantId = String(context.variantSelected.id);
            }
          }
          
          if (!variantId && gpData) {
            // Декодуємо HTML entities перед парсингом
            const decodedData = this.decodeHtmlEntities(gpData);
            const data = JSON.parse(decodedData);
            if (data.variantSelected && data.variantSelected.id) {
              variantId = String(data.variantSelected.id);
            }
          }
        } catch (e) {
          console.warn('LocalCart: Помилка парсингу gp-context/gp-data для variantId', e, {
            gpContext: gpContext?.substring(0, 100),
            gpData: gpData?.substring(0, 100)
          });
        }
      }
      
      // Якщо не знайшли в gp-атрибутах, витягуємо з форми
      if (!variantId) {
        const formData = new FormData(form);
        variantId = formData.get('id');
        
        if (!variantId) {
          const hiddenId = form.querySelector('input[name="id"]');
          if (hiddenId) {
            variantId = hiddenId.value;
          }
        }
      }

      if (!variantId) {
        console.error('LocalCart: Не вдалося знайти variant ID');
        this.showNotification('Помилка: не вдалося додати товар');
        return;
      }
      
      // Перетворюємо на рядок для консистентності
      variantId = String(variantId);
      
      const formData = new FormData(form);
      const quantity = parseInt(formData.get('quantity') || '1', 10);

      // Перевіряємо, чи обрані всі обов'язкові опції (розмір, колір тощо)
      const allOptionSelects = form.querySelectorAll('select[name^="options"]');
      const allOptionRadios = form.querySelectorAll('input[type="radio"][name^="options"]');
      
      // Перевіряємо select елементи
      for (const select of allOptionSelects) {
        if (!select.value || select.value === '' || select.value === '0' || select.value === 'null') {
          // Знаходимо label для кращого повідомлення
          const label = form.querySelector(`label[for="${select.id}"]`) || 
                       select.closest('label') ||
                       select.previousElementSibling;
          const optionName = (label && label.textContent && label.textContent.trim()) ? label.textContent.trim() : 'опцію';
          this.showNotification(`Будь ласка, оберіть ${optionName || 'опцію'}`);
          return;
        }
      }
      
      // Перевіряємо radio групи
      const radioGroups = new Set();
      allOptionRadios.forEach(radio => {
        radioGroups.add(radio.name);
      });
      
      for (const groupName of radioGroups) {
        const checked = form.querySelector(`input[type="radio"][name="${groupName}"]:checked`);
        if (!checked) {
          // Знаходимо label для кращого повідомлення
          const firstRadio = form.querySelector(`input[type="radio"][name="${groupName}"]`);
          const label = firstRadio ? (firstRadio.closest('label') || 
                       form.querySelector(`label[for="${firstRadio.id}"]`) ||
                       firstRadio.closest('.gp-variant-selector')?.querySelector('label') ||
                       firstRadio.closest('[data-option-name]')) : null;
          const optionName = label ? (label.textContent?.trim() || label.getAttribute('data-option-name') || 'опцію') : 'опцію';
          this.showNotification(`Будь ласка, оберіть ${optionName || 'опцію'}`);
          return;
        }
      }

      // Отримуємо інформацію про товар (передаємо актуальний variantId)
      const productData = this.extractProductData(form, variantId);
      
      if (!productData) {
        console.error('LocalCart: extractProductData повернув null/undefined');
        this.showNotification('Помилка: не вдалося отримати дані товару');
        return;
      }
      
      if (!productData.title || productData.title === 'undefined' || productData.title === '') {
        console.error('LocalCart: Не вдалося отримати назву товару', productData);
        this.showNotification('Помилка: не вдалося отримати назву товару');
        return;
      }
      
      // Перевіряємо, чи є ціна
      if (productData.price === undefined || productData.price === null || isNaN(productData.price)) {
        console.warn('LocalCart: Ціна не знайдена, встановлюємо 0', productData);
        productData.price = 0;
      }

      const selectedOptions = this.getSelectedOptions(form);
      
      // Визначаємо обраний варіант (упаковка з 5 або набір із 5+5)
      let packageVariant = '';
      
      // Спочатку перевіряємо через клік на блоки (найточніше)
      const variant1 = document.querySelector('.gsBS8TbNtS');
      const variant2 = document.querySelector('.gsqGvqR-tL');
      
      if (variant1) {
        const svg1 = variant1.querySelector('svg circle[fill="#00237E"]');
        if (svg1 && svg1.closest('svg').querySelector('circle[fill="#00237E"]:not([stroke])')) {
          packageVariant = 'упаковка з 5';
        }
      }
      
      if (!packageVariant && variant2) {
        const svg2 = variant2.querySelector('svg circle[fill="#00237E"]');
        if (svg2 && svg2.closest('svg').querySelector('circle[fill="#00237E"]:not([stroke])')) {
          packageVariant = 'набір із 5 + ОТРИМАЙТЕ 5 додаткових безкоштовних пар';
        }
      }
      
      // Якщо не знайшли через блоки, перевіряємо опції
      if (!packageVariant) {
        const buy5Option = selectedOptions['Buy 5 & Get 5 FREE'] || selectedOptions.option1;
        if (buy5Option) {
          if (buy5Option.includes('2x Black + 1x Blue + 1x Red + 1x Grey') || 
              buy5Option.includes('2x Black')) {
            packageVariant = 'упаковка з 5';
          } else if (buy5Option.includes('4x Black + 2x Red + 2x Blue + 2x Grey') ||
                     buy5Option.includes('4x Black')) {
            packageVariant = 'набір із 5 + ОТРИМАЙТЕ 5 додаткових безкоштовних пар';
          }
        }
      }
      
      // Визначаємо розмір
      const size = selectedOptions.Size || selectedOptions.option2 || '';
      
      // Визначаємо колір (якщо є окремий вибір кольору)
      let colorInfo = '';
      const colorOption = selectedOptions.Color || selectedOptions.option3;
      if (colorOption) {
        colorInfo = colorOption;
      }
      
      // Оновлюємо назву товару з обраними опціями
      let finalTitle = productData.title;
      const titleParts = [];
      
      if (packageVariant) {
        titleParts.push(packageVariant);
      }
      
      if (size) {
        titleParts.push(`Розмір: ${size}`);
      }
      
      if (colorInfo) {
        titleParts.push(colorInfo);
      }
      
      if (titleParts.length > 0) {
        const baseTitle = productData.title.split(' - ')[0];
        finalTitle = `${baseTitle} - ${titleParts.join(' / ')}`;
      } else if (selectedOptions && Object.keys(selectedOptions).length > 0) {
        // Fallback до попередньої логіки
        if (selectedOptions.public_title) {
          const baseTitle = productData.title.split(' - ')[0];
          if (selectedOptions.public_title.includes(baseTitle)) {
            finalTitle = selectedOptions.public_title;
          } else {
            finalTitle = `${baseTitle} - ${selectedOptions.public_title}`;
          }
        } else {
          const optionValues = Object.values(selectedOptions).filter(v => v && v !== '' && v !== 'null');
          if (optionValues.length > 0) {
            const baseTitle = productData.title.split(' - ')[0];
            finalTitle = `${baseTitle} - ${optionValues.join(' / ')}`;
          }
        }
      }
      
      // Оновлюємо фото залежно від варіанту упаковки
      let finalImage = productData.image;
      
      if (packageVariant === 'упаковка з 5') {
        // Фото для варіанту "упаковка з 5" - використовуємо формат з // на початку (як в JSON)
        finalImage = '//boxhero-us.com/cdn/shop/files/BOXHERO_PICTURE_PAGE_-_2025-11-12T160605.124.png?v=1763036617';
        // Обробляємо шлях до зображення (як в extractProductData)
        if (finalImage && !finalImage.startsWith('http') && !finalImage.startsWith('data:')) {
          if (finalImage.startsWith('//')) {
            finalImage = 'https:' + finalImage;
          } else if (finalImage.startsWith('/')) {
            finalImage = window.location.origin + finalImage;
          } else if (finalImage.startsWith('../')) {
            finalImage = window.location.origin + '/' + finalImage.replace('../', '');
          } else {
            // Для відносних шляхів (cdn/...) додаємо origin
            finalImage = window.location.origin + '/' + finalImage;
          }
        }
        console.log('LocalCart: Встановлено фото для "упаковка з 5":', finalImage);
      } else if (packageVariant === 'набір із 5 + ОТРИМАЙТЕ 5 додаткових безкоштовних пар') {
        // Фото для варіанту "набір із 5+5" - залишаємо оригінальне
        // Можна додати інше фото, якщо потрібно
      }
      
      // Перевіряємо, чи зображення встановлено правильно
      if (!finalImage || finalImage === '' || finalImage === 'undefined' || (typeof finalImage === 'string' && finalImage.includes('undefined'))) {
        console.warn('LocalCart: Проблема з зображенням, використовуємо fallback', {
          finalImage,
          packageVariant,
          productDataImage: productData.image
        });
        finalImage = productData.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
      }
      
      // Оновлюємо фото залежно від кольору (якщо є і не встановлено через варіант)
      if (colorInfo && finalImage === productData.image) {
        // Можна додати логіку для вибору фото залежно від кольору
        const colorImages = {
          'Black': productData.image,
          'Чорний': productData.image,
          'Red': productData.image,
          'Червоний': productData.image,
          'Blue': productData.image,
          'Синій': productData.image,
          'Grey': productData.image,
          'Сірий': productData.image
        };
        if (colorImages[colorInfo]) {
          finalImage = colorImages[colorInfo];
        }
      }
      
      // Логування для діагностики
      console.log('LocalCart: Додавання товару', {
        variantId,
        quantity,
        selectedOptions,
        finalTitle,
        packageVariant,
        finalImage,
        productData: {
          title: productData.title,
          price: productData.price,
          image: productData.image
        }
      });
      
      // Перевіряємо, чи зображення встановлено правильно
      if (!finalImage || finalImage === '' || finalImage === 'undefined' || finalImage === productData.image + 'undefined') {
        console.warn('LocalCart: Проблема з зображенням, використовуємо оригінальне', {
          finalImage,
          productDataImage: productData.image,
          packageVariant
        });
        finalImage = productData.image || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
      }
      
      this.addItem({
        ...productData,
        title: finalTitle,
        image: finalImage,
        variantId,
        quantity,
        selectedOptions: {
          ...selectedOptions,
          packageVariant: packageVariant,
          size: size,
          color: colorInfo
        }
      });
    } catch (error) {
      console.error('LocalCart: Помилка при додаванні до кошика:', error);
      this.showNotification('Помилка при додаванні товару');
    }
  }

  // Функція для декодування HTML entities
  decodeHtmlEntities(str) {
    if (!str) return str;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = str;
    return textarea.value;
  }

  extractProductData(form, variantIdOverride = null) {
    // Використовуємо переданий variantId або витягуємо з форми
    let variantId = variantIdOverride;
    if (!variantId) {
      const formData = new FormData(form);
      variantId = formData.get('id');
      
      if (!variantId) {
        const hiddenId = form.querySelector('input[name="id"]');
        if (hiddenId) {
          variantId = hiddenId.value;
        }
      }
    }
    
    // Перетворюємо на рядок для консистентності
    variantId = String(variantId || '');
    
    // Перевіряємо мета-теги (найнадійніші для сторінок товарів)
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogImage = document.querySelector('meta[property="og:image:secure_url"]') || 
                    document.querySelector('meta[property="og:image"]');
    const ogPrice = document.querySelector('meta[property="og:price:amount"]');
    const ogType = document.querySelector('meta[property="og:type"]');
    
    // Перевіряємо, чи це сторінка товару
    const isProductPage = ogType && ogType.content === 'product';
    
    // Перевіряємо JSON-LD структуровані дані
    let productInfo = null;
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'Product' || (Array.isArray(data) && data.find(d => d['@type'] === 'Product'))) {
          const product = Array.isArray(data) ? data.find(d => d['@type'] === 'Product') : data;
          if (product) {
            productInfo = {
              title: product.name || productInfo?.title,
              price: product.offers?.price ? (parseFloat(product.offers.price) * 100) : productInfo?.price,
              image: product.image?.[0] || product.image || productInfo?.image
            };
          }
        }
      } catch (e) {}
    }
    
    // Перевіряємо JSON дані в скриптах
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.product) {
          productInfo = data.product;
          break;
        }
      } catch (e) {}
    }

    // Перевіряємо глобальну змінну productInfo в скриптах
    try {
      const allScripts = document.querySelectorAll('script:not([type]), script[type="text/javascript"]');
      for (const script of allScripts) {
        const content = script.textContent;
        if (content.includes('var productInfo') || content.includes('productInfo =')) {
          // Спробуємо знайти productInfo в різних форматах
          const patterns = [
            /var productInfo\s*=\s*({[\s\S]+?});/,
            /productInfo\s*=\s*({[\s\S]+?});/,
            /"product":\s*({[\s\S]+?})/
          ];
          
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              try {
                const parsed = JSON.parse(match[1]);
                if (parsed && (parsed.title || parsed.id)) {
                  productInfo = parsed;
                  break;
                }
              } catch (e) {
                // Спробуємо знайти в gp-context або gp-data атрибутах
                const gpContext = document.querySelector('[gp-context]');
                if (gpContext) {
                  try {
                    const gpContextRaw = gpContext.getAttribute('gp-context');
                    const gpContextDecoded = this.decodeHtmlEntities(gpContextRaw);
                    const gpData = JSON.parse(gpContextDecoded);
                    if (gpData.productId) {
                      productInfo = productInfo || {};
                      productInfo.id = gpData.productId;
                    }
                  } catch (e) {}
                }
              }
            }
          }
          if (productInfo) break;
        }
      }
    } catch (e) {}

    // Перевіряємо gp-context та gp-data атрибути для даних варіанту (найточніші дані)
    let variantData = null;
    let productTitleFromGp = null;
    let productImageFromGp = null;
    
    const gpContextEl = document.querySelector('[gp-context]');
    if (gpContextEl) {
      try {
        const gpContextRaw = gpContextEl.getAttribute('gp-context');
        const gpContextDecoded = this.decodeHtmlEntities(gpContextRaw);
        const gpContext = JSON.parse(gpContextDecoded);
        if (gpContext.variantSelected) {
          variantData = gpContext.variantSelected;
        }
        // Можемо також отримати productId
        if (gpContext.productId) {
          productInfo = productInfo || {};
          productInfo.id = gpContext.productId;
        }
      } catch (e) {
        console.warn('LocalCart: Помилка парсингу gp-context', e);
      }
    }
    
    const gpDataEl = document.querySelector('[gp-data]');
    if (gpDataEl) {
      try {
        const gpDataRaw = gpDataEl.getAttribute('gp-data');
        const gpDataDecoded = this.decodeHtmlEntities(gpDataRaw);
        const gpData = JSON.parse(gpDataDecoded);
        if (gpData.variantSelected && !variantData) {
          variantData = gpData.variantSelected;
        }
        // Можемо отримати productUrl та productHandle
        if (gpData.productUrl) {
          productInfo = productInfo || {};
          productInfo.url = gpData.productUrl;
        }
        if (gpData.productHandle) {
          productInfo = productInfo || {};
          productInfo.handle = gpData.productHandle;
        }
      } catch (e) {
        console.warn('LocalCart: Помилка парсингу gp-data', e);
      }
    }
    
    // Якщо є variantData, використовуємо його дані для назви
    if (variantData && variantData.name) {
      productTitleFromGp = variantData.name;
    }

    // Знаходимо варіант за ID
    let variant = null;
    let price = 0;
    let image = '';
    let title = '';

    // ПРІОРИТЕТ 1: variantData з gp-атрибутів (найточніші дані)
    if (variantData && variantData.id == variantId) {
      // Ціна в variantData може бути в центах, тому ділимо на 100
      if (variantData.price) {
        price = typeof variantData.price === 'number' ? (variantData.price / 100) : parseFloat(variantData.price) / 100;
      } else {
        price = 0;
      }
      // Для зображення спробуємо знайти в productInfo або використаємо og:image
      if (productInfo && productInfo.featured_image) {
        image = productInfo.featured_image;
      } else if (ogImage) {
        image = ogImage.content;
      }
      
      // Назва з variantData.name (містить повну назву з варіантом)
      if (variantData.name) {
        title = variantData.name;
      } else if (variantData.public_title && productInfo?.title) {
        title = `${productInfo.title} - ${variantData.public_title}`;
      }
    }

    // ПРІОРИТЕТ 2: productInfo з variants
    if (productInfo && productInfo.variants) {
      variant = productInfo.variants.find(v => v.id == variantId);
      if (variant) {
        if (!price || price === 0) {
          // Ціна в variant.price може бути в центах
          if (variant.price) {
            price = typeof variant.price === 'number' ? (variant.price / 100) : parseFloat(variant.price) / 100;
          } else if (productInfo.price) {
            price = typeof productInfo.price === 'number' ? (productInfo.price / 100) : parseFloat(productInfo.price) / 100;
          } else {
            price = 0;
          }
        }
        if (!image) {
          image = variant.featured_image?.src || 
                  variant.featured_media?.preview_image?.src ||
                  productInfo.featured_image ||
                  productInfo.images?.[0] ||
                  '';
        }
        if (!title) {
          if (variant.name) {
            title = variant.name;
          } else if (variant.public_title) {
            title = `${productInfo.title} - ${variant.public_title}`;
          } else if (variant.title) {
            title = `${productInfo.title} - ${variant.title}`;
          }
        }
      }
      
      // Якщо не знайшли варіант, використовуємо базові дані товару
      if (!variant) {
        if (!price) price = productInfo.price ? (productInfo.price / 100) : 0;
        if (!image) image = productInfo.featured_image || productInfo.images?.[0] || '';
        if (!title) title = productInfo.title || '';
      }
    }

    // ПРІОРИТЕТ 3: Мета-теги (fallback)
    if (!price && ogPrice) price = parseFloat(ogPrice.content);
    if (!image && ogImage) image = ogImage.content;
    if (!title && ogTitle) title = ogTitle.content;

    // Фінальний fallback
    if (!title) title = 'Товар';
    if (!price) price = 0;
    
    const handle = productInfo?.handle || 
                   window.location.pathname.split('/').pop()?.replace('.html', '') || '';

    // Обробка зображення
    if (image) {
      if (image.startsWith('//')) {
        image = 'https:' + image;
      } else if (image.startsWith('/')) {
        image = window.location.origin + image;
      } else if (!image.startsWith('http')) {
        image = window.location.origin + '/' + image;
      }
    } else {
      // Fallback зображення
      image = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
    }

    // Перевіряємо, чи всі дані на місці
    if (!title || title === 'undefined' || title === '') {
      console.warn('LocalCart: Назва товару не знайдена, використовуємо fallback');
      title = 'Товар';
    }
    
    if (!price || isNaN(price)) {
      console.warn('LocalCart: Ціна не знайдена, встановлюємо 0');
      price = 0;
    }
    
    if (!image || image === 'undefined' || image === '') {
      image = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5ObyBJbWFnZTwvdGV4dD48L3N2Zz4=';
    }

    const result = {
      title: String(title || 'Товар'),
      image: String(image || ''),
      price: parseFloat(price || 0),
      handle: String(handle || ''),
      url: String(window.location.pathname || '')
    };

    // Логування для діагностики
    console.log('LocalCart: Витягнуті дані товару:', {
      title: result.title,
      price: result.price,
      image: result.image.substring(0, 50) + '...',
      variantId: variantId,
      isProductPage: isProductPage
    });

    return result;
  }

  getSelectedOptions(form) {
    const options = {};
    
    // Спочатку спробуємо отримати з gp-context або gp-data (найточніші дані)
    // Шукаємо gp-product елемент (може бути батьківським для product-form або самою формою)
    let gpProduct = form.closest('gp-product');
    if (!gpProduct) {
      const productForm = form.closest('product-form');
      if (productForm) {
        gpProduct = productForm.closest('gp-product');
      }
    }
    
    if (gpProduct) {
      const gpContext = gpProduct.getAttribute('gp-context');
      const gpData = gpProduct.getAttribute('gp-data');
      
      try {
        if (gpContext) {
          const gpContextDecoded = this.decodeHtmlEntities(gpContext);
          const context = JSON.parse(gpContextDecoded);
          if (context.variantSelected) {
            if (context.variantSelected.option1) options['option1'] = context.variantSelected.option1;
            if (context.variantSelected.option2) options['option2'] = context.variantSelected.option2;
            if (context.variantSelected.option3) options['option3'] = context.variantSelected.option3;
            if (context.variantSelected.public_title) options['public_title'] = context.variantSelected.public_title;
          }
        }
        
        if (gpData && Object.keys(options).length === 0) {
          const gpDataDecoded = this.decodeHtmlEntities(gpData);
          const data = JSON.parse(gpDataDecoded);
          if (data.variantSelected) {
            if (data.variantSelected.option1) options['option1'] = data.variantSelected.option1;
            if (data.variantSelected.option2) options['option2'] = data.variantSelected.option2;
            if (data.variantSelected.option3) options['option3'] = data.variantSelected.option3;
            if (data.variantSelected.public_title) options['public_title'] = data.variantSelected.public_title;
          }
        }
      } catch (e) {
        console.warn('LocalCart: Помилка парсингу gp-context/gp-data для опцій', e);
      }
    }
    
    // Витягуємо опції з форми
    const selects = form.querySelectorAll('select[name^="options"]');
    const inputs = form.querySelectorAll('input[type="radio"][name^="options"]:checked');
    
    selects.forEach(select => {
      const name = select.name.replace('options[', '').replace(']', '');
      if (select.value && select.value !== '' && select.value !== '0' && select.value !== 'null') {
        options[name] = select.value;
      }
    });
    
    inputs.forEach(input => {
      const name = input.name.replace('options[', '').replace(']', '');
      if (input.value && input.value !== '' && input.value !== '0' && input.value !== 'null') {
        options[name] = input.value;
      }
    });
    
    // Перевіряємо через gp-product-variants для опції "Buy 5 & Get 5 FREE"
    const variantSelectors = document.querySelectorAll('gp-product-variants');
    variantSelectors.forEach(variantSelector => {
      // Шукаємо опцію "Buy 5 & Get 5 FREE"
      const buy5Option = variantSelector.querySelector('div[option-name="Buy 5 & Get 5 FREE"], div[variant-option-name="Buy 5 & Get 5 FREE"]');
      if (buy5Option) {
        const checked = buy5Option.querySelector('input[type="radio"]:checked, label[data-selected="true"], label:has(input:checked)');
        if (checked) {
          const optionValue = checked.getAttribute('option-data') || 
                             checked.querySelector('.option-value-wrapper')?.getAttribute('option-data') ||
                             checked.querySelector('[option-data]')?.getAttribute('option-data') ||
                             checked.textContent.trim();
          if (optionValue && optionValue !== 'Buy 5 & Get 5 FREE') {
            options['Buy 5 & Get 5 FREE'] = optionValue;
          }
        }
      }
      
      // Шукаємо опцію "Size"
      const sizeOption = variantSelector.querySelector('div[option-name="Size"], div[variant-option-name="Size"]');
      if (sizeOption) {
        const checked = sizeOption.querySelector('input[type="radio"]:checked, select option:checked, [data-selected="true"], label:has(input:checked)');
        if (checked) {
          const optionValue = checked.value || checked.textContent.trim() || checked.getAttribute('data-value');
          if (optionValue && optionValue !== 'Size') {
            options['Size'] = optionValue;
          }
        }
      }
    });
    
    // Також перевіряємо через gp-variant-selector (якщо використовується)
    if (Object.keys(options).length === 0) {
      const variantSelectors = form.querySelectorAll('.gp-variant-selector, [data-option-name]');
      variantSelectors.forEach(selector => {
        const checked = selector.querySelector('input[type="radio"]:checked, select option:checked, [data-selected="true"]');
        if (checked) {
          const optionName = selector.getAttribute('data-option-name') || 
                           selector.querySelector('label')?.textContent.trim() ||
                           'option';
          const optionValue = checked.value || checked.textContent.trim() || checked.getAttribute('data-value');
          if (optionValue) {
            options[optionName] = optionValue;
          }
        }
      });
    }

    return options;
  }

  watchVariantChanges() {
    // Слухаємо зміни в селекторах варіантів
    const variantSelectors = document.querySelectorAll('select[name^="options"], input[type="radio"][name^="options"]');
    
    variantSelectors.forEach(selector => {
      selector.addEventListener('change', () => {
        // Оновлюємо variantId в формі при зміні опції
        const form = selector.closest('form[action*="/cart/add"]');
        if (form) {
          // Знаходимо gp-product для отримання нового variantId
          const gpProduct = form.closest('gp-product');
          if (gpProduct) {
            const gpContext = gpProduct.getAttribute('gp-context');
            const gpData = gpProduct.getAttribute('gp-data');
            
            try {
              let newVariantId = null;
              
              if (gpContext) {
                const context = JSON.parse(gpContext);
                if (context.variantSelected && context.variantSelected.id) {
                  newVariantId = context.variantSelected.id;
                }
              }
              
              if (!newVariantId && gpData) {
                const data = JSON.parse(gpData);
                if (data.variantSelected && data.variantSelected.id) {
                  newVariantId = data.variantSelected.id;
                }
              }
              
              if (newVariantId) {
                const hiddenId = form.querySelector('input[name="id"]');
                if (hiddenId) {
                  hiddenId.value = newVariantId;
                }
              }
            } catch (e) {
              console.warn('LocalCart: Помилка оновлення variantId', e);
            }
          }
        }
      });
    });
    
    // Також слухаємо зміни через MutationObserver для динамічних оновлень
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'gp-context') {
          const gpProduct = mutation.target;
          if (gpProduct.tagName === 'GP-PRODUCT') {
            const form = gpProduct.querySelector('form[action*="/cart/add"]');
            if (form) {
              try {
                const gpContext = gpProduct.getAttribute('gp-context');
                const context = JSON.parse(gpContext);
                if (context.variantSelected && context.variantSelected.id) {
                  const hiddenId = form.querySelector('input[name="id"]');
                  if (hiddenId) {
                    hiddenId.value = context.variantSelected.id;
                  }
                }
              } catch (e) {
                console.warn('LocalCart: Помилка оновлення variantId через observer', e);
              }
            }
          }
        }
      });
    });
    
    const gpProducts = document.querySelectorAll('gp-product');
    gpProducts.forEach(gpProduct => {
      observer.observe(gpProduct, { attributes: true, attributeFilter: ['gp-context', 'gp-data'] });
    });
  }

  convertHomepageFormsToLinks() {
    // Знаходимо всі product-form на головній сторінці
    const productForms = document.querySelectorAll('gp-product product-form');
    
    productForms.forEach(productForm => {
      const form = productForm.querySelector('form[action*="/cart/add"]');
      if (!form) return;
      
      // Знаходимо gp-product батьківський елемент
      const gpProduct = productForm.closest('gp-product');
      if (!gpProduct) return;
      
      // Отримуємо productUrl з gp-data або gp-context
      let productUrl = null;
      
      const gpData = gpProduct.getAttribute('gp-data');
      const gpContext = gpProduct.getAttribute('gp-context');
      
      try {
        if (gpData) {
          const gpDataDecoded = this.decodeHtmlEntities(gpData);
          const data = JSON.parse(gpDataDecoded);
          if (data.productUrl) {
            productUrl = data.productUrl;
          } else if (data.productHandle) {
            productUrl = `/products/${data.productHandle}`;
          }
        }
        
        if (!productUrl && gpContext) {
          const gpContextDecoded = this.decodeHtmlEntities(gpContext);
          const context = JSON.parse(gpContextDecoded);
          if (context.productUrl) {
            productUrl = context.productUrl;
          }
        }
      } catch (e) {
        console.warn('LocalCart: Помилка парсингу gp-data/gp-context', e);
      }
      
      // Нормалізуємо URL - переконуємося, що це відносний шлях
      if (productUrl) {
        // Якщо це абсолютний URL з іншим доменом, ігноруємо його
        if (productUrl.startsWith('http://') || productUrl.startsWith('https://')) {
          const urlObj = new URL(productUrl);
          const currentHost = window.location.hostname;
          // Якщо домен не співпадає, використовуємо тільки шлях
          if (urlObj.hostname !== currentHost && urlObj.hostname !== '') {
            productUrl = urlObj.pathname;
          } else {
            // Якщо домен співпадає, використовуємо тільки шлях
            productUrl = urlObj.pathname;
          }
        }
        
        // Перетворюємо на відносний шлях з .html
        if (productUrl.startsWith('/')) {
          productUrl = productUrl.replace(/\.html$/, '') + '.html';
        } else if (!productUrl.startsWith('http')) {
          productUrl = '/' + productUrl.replace(/\.html$/, '') + '.html';
        }
        
        // Переконуємося, що URL починається з /products/
        if (!productUrl.startsWith('/products/')) {
          console.warn('LocalCart: Некоректний productUrl:', productUrl);
          productUrl = null;
        }
      }
      
      // Робимо зображення товару клікабельними
      if (productUrl) {
        this.makeProductImagesClickable(gpProduct, productUrl);
      }
      
      // Якщо знайшли URL, обгортаємо форму в посилання
      if (productUrl) {
        
        // Знаходимо всі кнопки та елементи, які можуть бути кнопками додавання
        const buttons = form.querySelectorAll('button[type="submit"], .gp-content-product-button, [data-add-to-cart]');
        buttons.forEach(button => {
          // Створюємо посилання навколо кнопки або замінюємо кнопку
          const link = document.createElement('a');
          link.href = productUrl;
          link.className = button.className || '';
          link.style.cssText = button.style.cssText || '';
          link.innerHTML = button.innerHTML;
          
          // Копіюємо всі атрибути
          Array.from(button.attributes).forEach(attr => {
            if (attr.name !== 'type' && attr.name !== 'onclick') {
              link.setAttribute(attr.name, attr.value);
            }
          });
          
          button.parentNode.replaceChild(link, button);
        });
        
        // Також додаємо обробник на саму форму - при кліку переходимо на сторінку товару
        form.addEventListener('click', (e) => {
          // Перевіряємо, чи клік не на вже обробленому елементі
          if (!e.target.closest('a[href]')) {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = productUrl;
            return false;
          }
        }, true);
        
        // Видаляємо обробник submit
        form.onsubmit = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.location.href = productUrl;
          return false;
        };
      }
    });
  }

  makeProductImagesClickable(gpProduct, productUrl) {
    if (!productUrl || !gpProduct) return;
    
    // Спочатку перевіряємо, чи є вже посилання навколо зображень
    // Якщо є, оновлюємо їх href на правильний URL
    const existingLinks = gpProduct.querySelectorAll('a[href]');
    existingLinks.forEach(link => {
      const href = link.getAttribute('href');
      // Якщо посилання веде на інший сайт або некоректний URL, замінюємо його
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        try {
          const urlObj = new URL(href);
          const currentHost = window.location.hostname;
          // Якщо домен не співпадає, замінюємо на правильний URL
          if (urlObj.hostname !== currentHost && urlObj.hostname !== '') {
            link.href = productUrl;
          }
        } catch (e) {
          // Якщо не вдалося розпарсити URL, замінюємо на правильний
          link.href = productUrl;
        }
      } else if (href && !href.startsWith('/products/')) {
        // Якщо URL не починається з /products/, замінюємо на правильний
        link.href = productUrl;
      }
    });
    
    // Знаходимо всі зображення товару всередині gp-product
    // Шукаємо picture/img елементи та .gp-group/image, які не вже обгорнуті в посилання
    const imageContainers = gpProduct.querySelectorAll('.gp-group/image:not(a .gp-group/image), picture:not(a picture)');
    
    imageContainers.forEach(container => {
      // Перевіряємо, чи елемент не вже обгорнутий в посилання
      if (container.closest('a[href]')) return;
      
      // Створюємо посилання
      const link = document.createElement('a');
      link.href = productUrl;
      link.style.cssText = 'display: block; width: 100%; height: 100%; text-decoration: none; cursor: pointer;';
      link.className = 'product-image-link';
      
      // Обгортаємо container в посилання
      const parent = container.parentNode;
      if (parent) {
        parent.insertBefore(link, container);
        link.appendChild(container);
      }
    });
  }

  createCartUI() {
    // Знаходимо існуючу іконку кошика в хедері
    const existingCartIcon = document.getElementById('cart-icon-bubble') || 
                             document.querySelector('.header__icon--cart') ||
                             document.querySelector('a[href*="/cart"]');
    
    if (existingCartIcon) {
      // Додаємо лічильник до існуючої іконки
      let cartCount = existingCartIcon.querySelector('#cart-count');
      if (!cartCount) {
        cartCount = document.createElement('span');
        cartCount.id = 'cart-count';
        cartCount.className = 'cart-count-badge';
        const currentPosition = window.getComputedStyle(existingCartIcon).position;
        if (currentPosition === 'static') {
          existingCartIcon.style.position = 'relative';
        }
        existingCartIcon.appendChild(cartCount);
      }
      
      // Підключаємо обробник кліку - використовуємо capture для раннього перехоплення
      existingCartIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.toggleCart();
        return false;
      }, true);
    } else {
      // Якщо іконки немає, створюємо свою
      const cartButton = document.createElement('div');
      cartButton.id = 'local-cart-button';
      cartButton.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <path d="M16 10a4 4 0 0 1-8 0"></path>
        </svg>
        <span id="cart-count" class="cart-count-badge">0</span>
      `;
      cartButton.addEventListener('click', () => this.toggleCart());
      document.body.appendChild(cartButton);
    }

    // Створюємо модальне вікно кошика
    const cartModal = document.createElement('div');
    cartModal.id = 'local-cart-modal';
    cartModal.innerHTML = `
      <div class="cart-overlay"></div>
      <div class="cart-content">
        <div class="cart-header">
          <h2>Ваш кошик</h2>
          <button class="cart-close">&times;</button>
        </div>
        <div class="cart-items" id="cart-items"></div>
        <div class="cart-footer">
          <div class="cart-total">
            <strong>Разом: <span id="cart-total">0 грн.</span></strong>
          </div>
          <button class="cart-checkout-btn" id="checkout-btn">Замовити</button>
        </div>
      </div>
    `;
    document.body.appendChild(cartModal);

    // Обробники подій
    cartModal.querySelector('.cart-close').addEventListener('click', () => this.toggleCart());
    cartModal.querySelector('.cart-overlay').addEventListener('click', () => this.toggleCart());
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => this.showCheckoutForm());
    }
  }

  updateCartUI() {
    const count = this.getTotalItems();
    const countEl = document.getElementById('cart-count');
    if (countEl) {
      countEl.textContent = count;
      if (countEl.classList.contains('cart-count-badge')) {
        countEl.style.display = count > 0 ? 'flex' : 'none';
        // Завжди робимо круглим для одно- та двозначних чисел
        if (count > 99) {
          // Тільки для чисел > 99 робимо трохи ширшим
          countEl.style.width = 'auto';
          countEl.style.minWidth = '24px';
          countEl.style.maxWidth = '28px';
          countEl.style.height = '20px';
          countEl.style.padding = '0 4px';
          countEl.style.borderRadius = '10px';
          countEl.style.lineHeight = '20px';
        } else {
          // Для всіх інших - завжди круглий
          countEl.style.width = '20px';
          countEl.style.minWidth = '20px';
          countEl.style.maxWidth = '20px';
          countEl.style.height = '20px';
          countEl.style.padding = '0';
          countEl.style.borderRadius = '50%';
          countEl.style.lineHeight = '20px';
        }
      } else {
        countEl.style.display = count > 0 ? 'block' : 'none';
      }
    }

    const itemsEl = document.getElementById('cart-items');
    if (itemsEl) {
      // Завжди показуємо актуальний стан кошика
      console.log('LocalCart: Оновлення кошика, товарів:', this.cart.length);
      if (this.cart.length === 0) {
        itemsEl.innerHTML = '<div style="text-align: center; padding: 60px 24px; color: #999;"><p style="font-size: 16px; margin: 0;">Ваш кошик порожній</p></div>';
      } else {
        itemsEl.innerHTML = this.cart.map(item => {
          // Формуємо текст варіанту з обраних опцій
          let variantText = '';
          if (item.selectedOptions) {
            const parts = [];
            
            // Додаємо варіант упаковки
            if (item.selectedOptions.packageVariant) {
              parts.push(item.selectedOptions.packageVariant);
            }
            
            // Додаємо розмір
            if (item.selectedOptions.size) {
              parts.push(`Розмір: ${item.selectedOptions.size}`);
            }
            
            // Додаємо колір
            if (item.selectedOptions.color) {
              parts.push(item.selectedOptions.color);
            }
            
            // Якщо немає спеціальних опцій, використовуємо стандартні
            if (parts.length === 0) {
              const optionsToShow = { ...item.selectedOptions };
              delete optionsToShow.public_title;
              delete optionsToShow.packageVariant;
              delete optionsToShow.size;
              delete optionsToShow.color;
              
              if (Object.keys(optionsToShow).length > 0) {
                variantText = Object.values(optionsToShow).filter(v => v && v !== '').join(' / ');
              } else if (item.selectedOptions.public_title) {
                variantText = item.selectedOptions.public_title;
              }
            } else {
              variantText = parts.join(' / ');
            }
          }
          
          return `
          <div class="cart-item" data-id="${item.id}">
            <img src="${item.image}" alt="${item.title}" class="cart-item-image" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNzAiIGhlaWdodD0iNzAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjcwIiBoZWlnaHQ9IjcwIiBmaWxsPSIjZjVmNWY1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWl5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPk5vIEltYWdlPC90ZXh0Pjwvc3ZnPg=='">
            <div class="cart-item-info">
              <h4>${item.title}</h4>
              ${variantText ? `<div class="cart-item-variant">${variantText}</div>` : ''}
              <p class="cart-item-price">${(item.price * item.quantity).toFixed(0)} грн.</p>
            </div>
            <div class="cart-item-controls">
              <div class="cart-item-qty-controls">
                <button class="cart-qty-btn" onclick="localCart.updateQuantity(${item.id}, ${item.quantity - 1})">-</button>
                <span class="cart-qty">${item.quantity}</span>
                <button class="cart-qty-btn" onclick="localCart.updateQuantity(${item.id}, ${item.quantity + 1})">+</button>
              </div>
              <button class="cart-remove" onclick="localCart.removeItem(${item.id})" title="Видалити">&times;</button>
            </div>
          </div>
        `;
        }).join('');
      }
    }

    const totalEl = document.getElementById('cart-total');
    if (totalEl) {
      totalEl.textContent = `${this.getTotal().toFixed(0)} грн.`;
    }

    // Приховуємо footer, якщо кошик порожній
    const cartFooter = document.querySelector('.cart-footer');
    if (cartFooter) {
      cartFooter.style.display = this.cart.length > 0 ? 'block' : 'none';
    }
  }

  toggleCart() {
    const modal = document.getElementById('local-cart-modal');
    if (!modal) {
      console.error('LocalCart: Модальне вікно не знайдено');
      return;
    }
    
    const isActive = modal.classList.contains('active');
    if (isActive) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    } else {
      // Оновлюємо кошик перед відкриттям - перезавантажуємо з localStorage
      this.cart = this.loadCart();
      this.updateCartUI();
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      
      // Додатково оновлюємо через невелику затримку для надійності
      setTimeout(() => {
        this.cart = this.loadCart();
        this.updateCartUI();
      }, 100);
    }
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  showCheckoutForm() {
    if (this.cart.length === 0) return;

    const formModal = document.createElement('div');
    formModal.id = 'checkout-form-modal';
    formModal.innerHTML = `
      <div class="checkout-overlay"></div>
      <div class="checkout-content">
        <div class="checkout-header">
          <h2>Оформлення замовлення</h2>
          <button class="checkout-close">&times;</button>
        </div>
        <form id="checkout-form">
          <div class="form-group">
            <label>Ім'я *</label>
            <input type="text" name="name" required>
          </div>
          <div class="form-group">
            <label>Телефон *</label>
            <input type="tel" name="phone" required>
          </div>
          <button type="submit" class="checkout-submit">Підтвердити замовлення</button>
        </form>
      </div>
    `;
    document.body.appendChild(formModal);

    // Обробники
    formModal.querySelector('.checkout-close').addEventListener('click', () => formModal.remove());
    formModal.querySelector('.checkout-overlay').addEventListener('click', () => formModal.remove());
    
    formModal.querySelector('#checkout-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCheckout(formModal);
    });

    setTimeout(() => formModal.classList.add('active'), 10);
  }

  handleCheckout(formModal) {
    const formData = new FormData(formModal.querySelector('#checkout-form'));
    const orderData = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      items: this.cart,
      total: this.getTotal(),
      date: new Date().toISOString()
    };

    // Зберігаємо замовлення в localStorage
    const orders = JSON.parse(localStorage.getItem('boxhero_orders') || '[]');
    orders.push(orderData);
    localStorage.setItem('boxhero_orders', JSON.stringify(orders));

    // Очищаємо кошик
    this.clear();
    
    // Закриваємо модальні вікна
    formModal.remove();
    this.toggleCart();

    // Показуємо повідомлення про успіх
    this.showNotification('Замовлення успішно оформлено!');
  }
}

// Ініціалізуємо кошик
const localCart = new LocalCart();
window.localCart = localCart;

