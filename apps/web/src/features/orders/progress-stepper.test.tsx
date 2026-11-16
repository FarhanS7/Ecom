// apps/web/src/features/orders/progress-stepper.test.tsx - Unit tests for OrderProgressStepper (T057).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OrderProgressStepper } from './progress-stepper';

describe('OrderProgressStepper (T057)', () => {
  afterEach(cleanup);
  it('renders all canonical steps with Placed active initially', () => {
    render(<OrderProgressStepper paymentStatus="PENDING" fulfillmentStatus="PENDING" />);

    expect(screen.getByRole('list', { name: /order fulfillment progress/i })).toBeDefined();

    const placedStep = screen.getByTestId('stepper-step-placed');
    expect(placedStep.getAttribute('aria-current')).toBe('step');
    expect(placedStep.getAttribute('data-state')).toBe('current');

    const paidStep = screen.getByTestId('stepper-step-paid');
    expect(paidStep.getAttribute('data-state')).toBe('upcoming');
  });

  it('marks Placed completed and Paid current when paymentStatus is PAID', () => {
    render(<OrderProgressStepper paymentStatus="PAID" fulfillmentStatus="PENDING" />);

    const placedStep = screen.getByTestId('stepper-step-placed');
    expect(placedStep.getAttribute('data-state')).toBe('completed');

    const paidStep = screen.getByTestId('stepper-step-paid');
    expect(paidStep.getAttribute('aria-current')).toBe('step');
    expect(paidStep.getAttribute('data-state')).toBe('current');
  });

  it('highlights Packed step when fulfillmentStatus is PACKED', () => {
    render(<OrderProgressStepper paymentStatus="PAID" fulfillmentStatus="PACKED" />);

    const placedStep = screen.getByTestId('stepper-step-placed');
    expect(placedStep.getAttribute('data-state')).toBe('completed');

    const paidStep = screen.getByTestId('stepper-step-paid');
    expect(paidStep.getAttribute('data-state')).toBe('completed');

    const packedStep = screen.getByTestId('stepper-step-packed');
    expect(packedStep.getAttribute('aria-current')).toBe('step');
    expect(packedStep.getAttribute('data-state')).toBe('current');
  });

  it('highlights Shipped step and displays tracking information', () => {
    render(
      <OrderProgressStepper
        paymentStatus="PAID"
        fulfillmentStatus="SHIPPED"
        trackingRef="TRACK-XYZ-999"
        carrier="DHL Express"
      />,
    );

    const shippedStep = screen.getByTestId('stepper-step-shipped');
    expect(shippedStep.getAttribute('aria-current')).toBe('step');
    expect(shippedStep.getAttribute('data-state')).toBe('current');

    const trackingBox = screen.getByTestId('tracking-info');
    expect(trackingBox.textContent).toContain('DHL Express');
    expect(trackingBox.textContent).toContain('TRACK-XYZ-999');
  });

  it('highlights Delivered step when order is DELIVERED', () => {
    render(
      <OrderProgressStepper
        paymentStatus="PAID"
        fulfillmentStatus="DELIVERED"
        trackingRef="TRACK-123"
        carrier="FedEx"
      />,
    );

    const deliveredStep = screen.getByTestId('stepper-step-delivered');
    expect(deliveredStep.getAttribute('aria-current')).toBe('step');
    expect(deliveredStep.getAttribute('data-state')).toBe('current');

    const shippedStep = screen.getByTestId('stepper-step-shipped');
    expect(shippedStep.getAttribute('data-state')).toBe('completed');
  });

  it('renders alert when payment has failed', () => {
    render(<OrderProgressStepper paymentStatus="FAILED" fulfillmentStatus="CANCELLED" />);

    expect(screen.getByTestId('status-failed')).toBeDefined();
    expect(screen.getByText(/Payment was unsuccessful/i)).toBeDefined();
  });

  it('renders status when order is refunded', () => {
    render(<OrderProgressStepper paymentStatus="REFUNDED" fulfillmentStatus="CANCELLED" />);

    expect(screen.getByTestId('status-refunded')).toBeDefined();
    expect(screen.getByText(/has been refunded/i)).toBeDefined();
  });

  it('renders status when order is cancelled', () => {
    render(<OrderProgressStepper paymentStatus="PAID" fulfillmentStatus="CANCELLED" />);

    expect(screen.getByTestId('status-cancelled')).toBeDefined();
    expect(screen.getByText(/order has been cancelled/i)).toBeDefined();
  });
});
