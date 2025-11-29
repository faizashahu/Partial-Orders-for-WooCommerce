jQuery(function ($) {
    // Ensure this script only runs on the checkout page
    if (!$('form.checkout').length) return;

    let timer = null;
    let orderKey = localStorage.getItem('partial_order_key') || '';
    let isProcessing = false;

    /**
     * Function to collect form data
     * @returns {FormData} - The form data to be sent to the server
     */
    function collectFormData() {
        const formData = new FormData($('form.checkout')[0]);
        formData.append('action', 'save_partial_order');
        formData.append('nonce', wcPartialOrders.nonce);

        if (orderKey) {
            formData.append('order_key', orderKey);
        }

        return formData;
    }

    /**
     * Function to send form data to the server via AJAX
     * @param {FormData} formData - The data to be sent to the server
     */
    function saveFormData(formData) {
        if (isProcessing) return;
        
        isProcessing = true;
        
        $.ajax({
            url: wcPartialOrders.ajax_url,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (response) {
                if (response.success) {
                    // Save the order key in localStorage
                    orderKey = response.data.order_key;
                    localStorage.setItem('partial_order_key', orderKey);
                    console.log('Partial order updated successfully');
                } else {
                    console.error('Failed to save partial order:', response.data);
                }
            },
            error: function (xhr, status, error) {
                console.error('Error saving partial order:', error);
            },
            complete: function() {
                isProcessing = false;
            }
        });
    }

    /**
     * Function to determine if the form has data to save
     * @returns {boolean} - True if there is data to save, otherwise false
     */
    function hasRelevantData() {
        const requiredFields = [
            'billing_first_name',
            'billing_last_name',
            'billing_email',
            'billing_address_1',
        ];

        let hasData = false;
        for (let field of requiredFields) {
            if ($(`[name="${field}"]`).val()) {
                hasData = true;
                break;
            }
        }

        return hasData && WC_CHECKOUT_DATA_CHANGED;
    }

    let WC_CHECKOUT_DATA_CHANGED = false;

    /**
     * Event listener for field changes
     * Saves partial order data when any field is updated
     */
    $('form.checkout').on('change keyup', 'input, select, textarea', function () {
        WC_CHECKOUT_DATA_CHANGED = true;
        
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (hasRelevantData()) {
                const formData = collectFormData();
                saveFormData(formData);
                WC_CHECKOUT_DATA_CHANGED = false;
            }
        }, 1500);
    });

    /**
     * Event listener for cart update events
     */
    $(document.body).on('updated_cart_totals updated_checkout', function() {
        WC_CHECKOUT_DATA_CHANGED = true;
        
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (hasRelevantData()) {
                const formData = collectFormData();
                saveFormData(formData);
                WC_CHECKOUT_DATA_CHANGED = false;
            }
        }, 1500);
    });

    /**
     * Save partial order data on page load if the form already has data
     */
    $(document).ready(function () {
        if (hasRelevantData()) {
            const formData = collectFormData();
            saveFormData(formData);
        }
    });

    /**
     * Event listener for before the user leaves the page
     * Ensures partial data is saved before leaving
     */
    $(window).on('beforeunload', function () {
        if (hasRelevantData()) {
            const formData = collectFormData();
            navigator.sendBeacon(wcPartialOrders.ajax_url, formData);
        }
    });

    /**
     * Event listener for WooCommerce events
     * Handles clearing of local storage on successful order creation
     */
    $(document.body)
        .on('checkout_error', function () {
            // Keep partial data on checkout errors
            console.log('Checkout error occurred, partial order data retained.');
        })
        .on('checkout_place_order_success', function () {
            // Clear partial data on successful order placement
            localStorage.removeItem('partial_order_key');
            console.log('Order completed, partial order data cleared.');
        });
});