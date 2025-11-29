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

    let fraudCheckInProgress = false;
    let fraudCheckPassed = false;

    $('form.checkout').on('checkout_place_order', function(e) {
        const paymentMethod = $('input[name="payment_method"]:checked').val();

        if (paymentMethod !== 'cod') {
            return true;
        }

        if (fraudCheckPassed) {
            return true;
        }

        if (fraudCheckInProgress) {
            return false;
        }

        const billingPhone = $('input[name="billing_phone"]').val();

        if (!billingPhone) {
            return true;
        }

        fraudCheckInProgress = true;

        $.ajax({
            url: wcPartialOrders.ajax_url,
            type: 'POST',
            data: {
                action: 'check_fraud_prevention',
                nonce: wcPartialOrders.fraud_nonce,
                phone: billingPhone
            },
            success: function(response) {
                if (response.success && response.data) {
                    if (response.data.passed) {
                        fraudCheckPassed = true;
                        $('form.checkout').submit();
                    } else {
                        showAdvancePaymentModal();
                    }
                } else {
                    fraudCheckPassed = true;
                    $('form.checkout').submit();
                }
            },
            error: function() {
                fraudCheckPassed = true;
                $('form.checkout').submit();
            },
            complete: function() {
                fraudCheckInProgress = false;
            }
        });

        return false;
    });

    function showAdvancePaymentModal() {
        if ($('#fps-payment-modal').length) {
            $('#fps-payment-modal').show();
            return;
        }

        const shippingTotal = parseFloat($('.shipping .woocommerce-Price-amount').text().replace(/[^0-9.]/g, '')) || 0;
        const customCharge = wcPartialOrders.custom_cod_charge;
        const chargeAmount = customCharge ? parseFloat(customCharge) : shippingTotal;

        const currencySymbol = $('.woocommerce-Price-currencySymbol').first().text() || '';

        const availableGateways = [];
        $('.wc_payment_methods .wc_payment_method').each(function() {
            const input = $(this).find('input.input-radio');
            const label = $(this).find('label').text().trim();
            const value = input.val();

            if (value !== 'cod') {
                availableGateways.push({
                    value: value,
                    label: label
                });
            }
        });

        let gatewayOptions = '';
        availableGateways.forEach(function(gateway) {
            gatewayOptions += `<option value="${gateway.value}">${gateway.label}</option>`;
        });

        const modalHTML = `
            <div id="fps-payment-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999;">
                <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:white; padding:30px; border-radius:8px; max-width:500px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
                    <h2 style="margin-top:0; color:#333;">Advance Payment Required</h2>
                    <p style="color:#666;">Please pay the delivery charges in advance to proceed with your order.</p>
                    <p style="font-size:18px; font-weight:bold; color:#0073aa;">Amount to pay: ${currencySymbol}${chargeAmount.toFixed(2)}</p>

                    <div style="margin:20px 0;">
                        <label for="fps-payment-method" style="display:block; margin-bottom:10px; font-weight:600;">Select Payment Method:</label>
                        <select id="fps-payment-method" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:14px;">
                            ${gatewayOptions}
                        </select>
                    </div>

                    <div style="background:#f9f9f9; padding:15px; border-radius:4px; margin-bottom:20px;">
                        <p style="margin:0; font-size:13px; color:#666;">
                            <strong>Note:</strong> After successful payment of the delivery charge, you will be able to complete your order. The advance payment will be deducted from your order total.
                        </p>
                    </div>

                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button id="fps-proceed-payment" style="flex:1; padding:12px 20px; background:#0073aa; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; transition:background 0.3s;">Proceed to Payment</button>
                        <button id="fps-cancel-payment" style="flex:1; padding:12px 20px; background:#ddd; color:#333; border:none; border-radius:4px; cursor:pointer; font-weight:600; transition:background 0.3s;">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        $('body').append(modalHTML);

        $('#fps-proceed-payment').on('mouseenter', function() {
            $(this).css('background', '#005177');
        }).on('mouseleave', function() {
            $(this).css('background', '#0073aa');
        });

        $('#fps-cancel-payment').on('mouseenter', function() {
            $(this).css('background', '#ccc');
        }).on('mouseleave', function() {
            $(this).css('background', '#ddd');
        });

        $('#fps-cancel-payment').on('click', function() {
            $('#fps-payment-modal').hide();
        });

        $('#fps-proceed-payment').on('click', function() {
            const selectedGateway = $('#fps-payment-method').val();

            const originalPaymentMethod = $('input[name="payment_method"]:checked').val();

            $('input[name="payment_method"][value="' + selectedGateway + '"]').prop('checked', true).trigger('change');

            $('#fps-payment-modal').hide();

            fraudCheckPassed = true;

            $('form.checkout').one('checkout_place_order_success', function(event, result) {
                if (result && result.result === 'success') {
                    $('input[name="payment_method"][value="' + originalPaymentMethod + '"]').prop('checked', true);
                }
            });

            $('form.checkout').submit();
        });
    }
});