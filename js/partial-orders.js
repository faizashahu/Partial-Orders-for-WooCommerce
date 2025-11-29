// ===================================================================
// FRAUD PREVENTION SYSTEM - MUST RUN FIRST, OUTSIDE JQUERY WRAPPER
// ===================================================================
(function() {
    'use strict';

    let fraudCheckInProgress = false;
    let fraudCheckPassed = false;
    let fraudCheckData = null;

    // Global click handler in CAPTURE phase - blocks ALL clicks on Place Order button
    document.addEventListener('click', function(e) {
        // Check if click is on Place Order button
        var btn = e.target.closest('#place_order');
        if (!btn) {
            btn = e.target.closest('button.wc-block-components-checkout-place-order-button');
        }

        if (!btn) {
            return; // Not the place order button, allow click
        }

        console.log('%c[Fraud Prevention] Place Order button clicked', 'color: #0073aa; font-weight: bold;');

        // Check payment method
        var paymentMethod = null;
        var codRadio = document.querySelector('input[name="payment_method"][value="cod"]:checked');
        if (codRadio) {
            paymentMethod = 'cod';
        } else {
            var anyChecked = document.querySelector('input[name="payment_method"]:checked');
            if (anyChecked) {
                paymentMethod = anyChecked.value;
            }
        }

        // If not COD, allow order
        if (paymentMethod !== 'cod') {
            console.log('%c[Fraud Prevention] Payment method is not COD (' + (paymentMethod || 'unknown') + '), allowing order', 'color: #00a0d2; font-weight: bold;');
            return;
        }

        console.log('%c[Fraud Prevention] COD payment detected, checking fraud prevention', 'color: #0073aa; font-weight: bold;');

        // If already passed, allow
        if (fraudCheckPassed) {
            console.log('%c[Fraud Prevention] Check already passed, allowing order', 'color: #46b450; font-weight: bold;');
            return;
        }

        // If check in progress, block
        if (fraudCheckInProgress) {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log('%c[Fraud Prevention] Check in progress, blocking order', 'color: #f56e28; font-weight: bold;');
            return;
        }

        // Get phone number
        var phoneInput = document.querySelector('input[name="billing_phone"]');
        var billingPhone = phoneInput ? phoneInput.value : '';

        if (!billingPhone) {
            console.log('%c[Fraud Prevention] No billing phone found, allowing order', 'color: #00a0d2; font-weight: bold;');
            return;
        }

        // BLOCK THE ORDER - Must check fraud first
        e.preventDefault();
        e.stopImmediatePropagation();

        console.log('%c[Fraud Prevention] Starting fraud check...', 'color: #0073aa; font-weight: bold;');
        console.log('Phone number:', billingPhone);

        fraudCheckInProgress = true;

        // Make AJAX request
        var xhr = new XMLHttpRequest();
        xhr.open('POST', wcPartialOrders.ajax_url, true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

        xhr.onload = function() {
            fraudCheckInProgress = false;

            if (xhr.status === 200) {
                try {
                    var response = JSON.parse(xhr.responseText);

                    if (response.success && response.data) {
                        fraudCheckData = response.data;

                        // Check if bypassed
                        if (response.data.reason) {
                            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                            console.log('%c[Fraud Prevention] Check Bypassed', 'color: #f56e28; font-weight: bold; font-size: 14px;');
                            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                            console.log('%cReason:', 'font-weight: bold;', response.data.reason);
                            console.log('%c✓ Order Allowed', 'color: #46b450; font-weight: bold; font-size: 16px; background: #ecf7ed; padding: 5px 10px;');
                            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                            fraudCheckPassed = true;
                            btn.click();
                            return;
                        }

                        // Display full check results
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        console.log('%c[Fraud Prevention] API Response Received', 'color: #0073aa; font-weight: bold; font-size: 14px;');
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        console.log('%cPhone Number:', 'font-weight: bold;', response.data.phone || billingPhone);
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        console.log('%cDelivery Statistics:', 'color: #0073aa; font-weight: bold;');
                        console.log('%cTotal Deliveries:', 'font-weight: bold;', response.data.total_parcels);
                        console.log('%cSuccessful Deliveries:', 'font-weight: bold;', response.data.delivered);
                        console.log('%cCancelled/Returned:', 'font-weight: bold;', (response.data.returned || (response.data.total_parcels - response.data.delivered)));
                        console.log('%cSuccess Score:', 'font-weight: bold;', response.data.score + '%');
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        console.log('%cRequired Thresholds:', 'color: #0073aa; font-weight: bold;');
                        console.log('%cMinimum Orders:', 'font-weight: bold;', response.data.minimum_orders);
                        console.log('%cMinimum Score:', 'font-weight: bold;', response.data.minimum_score + '%');
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                        console.log('%cValidation Results:', 'color: #0073aa; font-weight: bold;');

                        var ordersPassed = response.data.total_parcels >= response.data.minimum_orders;
                        var scorePassed = response.data.score >= response.data.minimum_score;

                        console.log('%cMinimum Orders Check:', 'font-weight: bold;',
                            ordersPassed ? '✓ PASSED' : '✗ FAILED',
                            ordersPassed ? '(color: #46b450)' : '(color: #dc3232)'
                        );
                        console.log('%c  → Required: ' + response.data.minimum_orders + ' | Actual: ' + response.data.total_parcels,
                            'font-style: italic; color: #666;'
                        );

                        console.log('%cMinimum Score Check:', 'font-weight: bold;',
                            scorePassed ? '✓ PASSED' : '✗ FAILED',
                            scorePassed ? '(color: #46b450)' : '(color: #dc3232)'
                        );
                        console.log('%c  → Required: ' + response.data.minimum_score + '% | Actual: ' + response.data.score + '%',
                            'font-style: italic; color: #666;'
                        );
                        console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');

                        if (response.data.passed) {
                            console.log('%c✓ FRAUD CHECK PASSED - Order Allowed', 'color: #46b450; font-weight: bold; font-size: 16px; background: #ecf7ed; padding: 5px 10px;');
                            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                            fraudCheckPassed = true;
                            btn.click();
                        } else {
                            console.log('%c✗ FRAUD CHECK FAILED - Order Blocked', 'color: #dc3232; font-weight: bold; font-size: 16px; background: #f9e2e2; padding: 5px 10px;');
                            console.log('%cAdvance payment required to proceed', 'color: #f56e28; font-style: italic;');
                            console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #0073aa;');
                            showAdvancePaymentModal(response.data);
                        }
                    } else {
                        console.log('%c[Fraud Prevention] Invalid API response, allowing order', 'color: #f56e28; font-weight: bold;');
                        fraudCheckPassed = true;
                        btn.click();
                    }
                } catch (error) {
                    console.log('%c[Fraud Prevention] Error parsing response, allowing order', 'color: #dc3232; font-weight: bold;');
                    console.error(error);
                    fraudCheckPassed = true;
                    btn.click();
                }
            } else {
                console.log('%c[Fraud Prevention] API request failed, allowing order', 'color: #dc3232; font-weight: bold;');
                fraudCheckPassed = true;
                btn.click();
            }
        };

        xhr.onerror = function() {
            fraudCheckInProgress = false;
            console.log('%c[Fraud Prevention] Network error, allowing order', 'color: #dc3232; font-weight: bold;');
            fraudCheckPassed = true;
            btn.click();
        };

        var formData = 'action=check_fraud_prevention';
        formData += '&nonce=' + encodeURIComponent(wcPartialOrders.fraud_nonce);
        formData += '&phone=' + encodeURIComponent(billingPhone);

        xhr.send(formData);

    }, true); // CAPTURE PHASE - critical to intercept before other handlers

    function showAdvancePaymentModal(checkData) {
        // Wait for jQuery to be available
        if (typeof jQuery === 'undefined') {
            setTimeout(function() {
                showAdvancePaymentModal(checkData);
            }, 100);
            return;
        }

        var $ = jQuery;

        if ($('#fps-payment-modal').length) {
            $('#fps-payment-modal').show();
            return;
        }

        checkData = checkData || fraudCheckData || {};

        var shippingTotal = parseFloat($('.shipping .woocommerce-Price-amount').text().replace(/[^0-9.]/g, '')) || 0;
        var customCharge = wcPartialOrders.custom_cod_charge;
        var chargeAmount = customCharge ? parseFloat(customCharge) : shippingTotal;

        var currencySymbol = $('.woocommerce-Price-currencySymbol').first().text() || '';

        var availableGateways = [];
        $('.wc_payment_methods .wc_payment_method').each(function() {
            var input = $(this).find('input.input-radio');
            var label = $(this).find('label').text().trim();
            var value = input.val();

            if (value !== 'cod') {
                availableGateways.push({
                    value: value,
                    label: label
                });
            }
        });

        var gatewayOptions = '';
        availableGateways.forEach(function(gateway) {
            gatewayOptions += '<option value="' + gateway.value + '">' + gateway.label + '</option>';
        });

        var checkDetailsHTML = '';
        if (checkData && checkData.total_parcels !== undefined) {
            checkDetailsHTML = '<div style="background:#fff3cd; border-left:4px solid #f56e28; padding:12px 15px; margin-bottom:20px; border-radius:4px;">' +
                '<p style="margin:0 0 8px 0; font-size:13px; color:#856404; font-weight:600;">Verification Results:</p>' +
                '<p style="margin:0; font-size:12px; color:#856404; line-height:1.6;">' +
                'Total Orders: <strong>' + checkData.total_parcels + '</strong> | ' +
                'Successful: <strong>' + checkData.delivered + '</strong> | ' +
                'Success Rate: <strong>' + checkData.score + '%</strong>' +
                '</p>' +
                '<p style="margin:8px 0 0 0; font-size:12px; color:#856404;">' +
                'Required: <strong>' + checkData.minimum_orders + '+ orders</strong> with <strong>' + checkData.minimum_score + '%+ success rate</strong>' +
                '</p>' +
                '</div>';
        }

        var modalHTML = '<div id="fps-payment-modal" style="display:block; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999;">' +
            '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); background:white; padding:30px; border-radius:8px; max-width:500px; width:90%; box-shadow:0 4px 20px rgba(0,0,0,0.3);">' +
            '<h2 style="margin-top:0; color:#333;">Advance Payment Required</h2>' +
            checkDetailsHTML +
            '<p style="color:#666;">Please pay the delivery charges in advance to proceed with your order.</p>' +
            '<p style="font-size:18px; font-weight:bold; color:#0073aa;">Amount to pay: ' + currencySymbol + chargeAmount.toFixed(2) + '</p>' +
            '<div style="margin:20px 0;">' +
            '<label for="fps-payment-method" style="display:block; margin-bottom:10px; font-weight:600;">Select Payment Method:</label>' +
            '<select id="fps-payment-method" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:14px;">' +
            gatewayOptions +
            '</select>' +
            '</div>' +
            '<div style="background:#f9f9f9; padding:15px; border-radius:4px; margin-bottom:20px;">' +
            '<p style="margin:0; font-size:13px; color:#666;"><strong>Note:</strong> After successful payment of the delivery charge, you will be able to complete your order. The advance payment will be deducted from your order total.</p>' +
            '</div>' +
            '<div style="display:flex; gap:10px; margin-top:20px;">' +
            '<button id="fps-proceed-payment" style="flex:1; padding:12px 20px; background:#0073aa; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600;">Proceed to Payment</button>' +
            '<button id="fps-cancel-payment" style="flex:1; padding:12px 20px; background:#ddd; color:#333; border:none; border-radius:4px; cursor:pointer; font-weight:600;">Cancel</button>' +
            '</div>' +
            '</div>' +
            '</div>';

        $('body').append(modalHTML);

        $('#fps-cancel-payment').on('click', function() {
            $('#fps-payment-modal').remove();
        });

        $('#fps-proceed-payment').on('click', function() {
            var selectedGateway = $('#fps-payment-method').val();
            $('input[name="payment_method"][value="' + selectedGateway + '"]').prop('checked', true).trigger('change');
            $('#fps-payment-modal').remove();
            fraudCheckPassed = true;

            setTimeout(function() {
                var placeOrderBtn = document.querySelector('#place_order') || document.querySelector('button.wc-block-components-checkout-place-order-button');
                if (placeOrderBtn) {
                    placeOrderBtn.click();
                }
            }, 500);
        });
    }

})();

// ===================================================================
// PARTIAL ORDERS - ORIGINAL FUNCTIONALITY
// ===================================================================
jQuery(function ($) {
    // Ensure this script only runs on the checkout page
    if (!$('form.checkout').length) return;

    let timer = null;
    let orderKey = localStorage.getItem('partial_order_key') || '';
    let isProcessing = false;

    function collectFormData() {
        const formData = new FormData($('form.checkout')[0]);
        formData.append('action', 'save_partial_order');
        formData.append('nonce', wcPartialOrders.nonce);

        if (orderKey) {
            formData.append('order_key', orderKey);
        }

        return formData;
    }

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

    $(document).ready(function () {
        if (hasRelevantData()) {
            const formData = collectFormData();
            saveFormData(formData);
        }
    });

    $(window).on('beforeunload', function () {
        if (hasRelevantData()) {
            const formData = collectFormData();
            navigator.sendBeacon(wcPartialOrders.ajax_url, formData);
        }
    });

    $(document.body)
        .on('checkout_error', function () {
            console.log('Checkout error occurred, partial order data retained.');
        })
        .on('checkout_place_order_success', function () {
            localStorage.removeItem('partial_order_key');
            console.log('Order completed, partial order data cleared.');
        });
});
