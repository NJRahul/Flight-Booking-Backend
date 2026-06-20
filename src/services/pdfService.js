const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { format } = require('date-fns');

const CONVENIENCE_FEE = 99;

/**
 * Generate a booking confirmation PDF.
 * @param {Object} booking - Plain booking object (via .toObject()) with populated flight.
 * @returns {Promise<Buffer>}
 */
async function generateBookingPDF(booking) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Safe accessors ──────────────────────────────────────────────────────
      const flight = booking.flight || {};
      const origin = flight.origin || {};
      const destination = flight.destination || {};
      const airline = flight.airline || {};
      const pricing = booking.pricing || {};
      const baggage = flight.baggage || {};

      const originCity = origin.city || 'N/A';
      const originCode = origin.code || 'N/A';
      const destCity = destination.city || 'N/A';
      const destCode = destination.code || 'N/A';

      const departureTime = flight.departureTime ? new Date(flight.departureTime) : null;
      const arrivalTime = flight.arrivalTime ? new Date(flight.arrivalTime) : null;
      const duration = flight.duration || 0;

      const pageWidth = doc.page.width;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      // ── 1. HEADER ───────────────────────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor('#2563eb')
        .text('FlightBook', margin, margin, { continued: false });

      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#6b7280')
        .text('Your Trusted Flight Booking Partner', margin, margin + 6, {
          align: 'right',
          width: contentWidth,
        });

      const headerLineY = margin + 30;
      doc
        .moveTo(margin, headerLineY)
        .lineTo(pageWidth - margin, headerLineY)
        .lineWidth(2)
        .strokeColor('#2563eb')
        .stroke();

      // ── 2. BOOKING CONFIRMED BOX ────────────────────────────────────────────
      const boxY = headerLineY + 15;
      const boxHeight = 80;
      doc
        .rect(margin, boxY, contentWidth, boxHeight)
        .lineWidth(1.5)
        .strokeColor('#16a34a')
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#16a34a')
        .text('BOOKING CONFIRMED ✓', margin + 10, boxY + 10);

      doc
        .font('Helvetica-Bold')
        .fontSize(28)
        .fillColor('#1e3a8a')
        .text(booking.bookingReference || 'N/A', margin + 10, boxY + 24);

      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#6b7280')
        .text(
          `${originCity} → ${destCity}`,
          margin + 10,
          boxY + 58
        );

      // ── 3. FLIGHT DETAILS ───────────────────────────────────────────────────
      const sectionGap = 20;
      let currentY = boxY + boxHeight + sectionGap;

      // Section header
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#374151')
        .text('FLIGHT DETAILS', margin, currentY);
      currentY += 14;

      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .lineWidth(0.5)
        .strokeColor('#d1d5db')
        .stroke();
      currentY += 8;

      const labelX = margin;
      const valueX = margin + 160;
      const rowH = 16;

      const flightRows = [
        ['Flight Number', flight.flightNumber || 'N/A'],
        ['Date', departureTime ? format(departureTime, 'dd MMM yyyy, EEEE') : 'N/A'],
        ['Route', `${originCity} (${originCode}) → ${destCity} (${destCode})`],
        ['Departure', departureTime ? format(departureTime, 'HH:mm') : 'N/A'],
        ['Arrival', arrivalTime ? format(arrivalTime, 'HH:mm') : 'N/A'],
        [
          'Duration',
          duration
            ? `${Math.floor(duration / 60)}h ${duration % 60}m`
            : 'N/A',
        ],
        [
          'Class',
          booking.class
            ? booking.class.charAt(0).toUpperCase() + booking.class.slice(1)
            : 'N/A',
        ],
      ];

      flightRows.forEach(([label, value]) => {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#6b7280')
          .text(label, labelX, currentY);
        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#111827')
          .text(value, valueX, currentY);
        currentY += rowH;
      });

      // Visual route line box
      currentY += 6;
      const routeBoxH = 28;
      doc
        .rect(margin, currentY, contentWidth, routeBoxH)
        .fillColor('#f3f4f6')
        .fill();
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#374151')
        .text(
          `${originCode} ─────────── ✈ ─────────── ${destCode}`,
          margin,
          currentY + 8,
          { align: 'center', width: contentWidth }
        );
      currentY += routeBoxH + sectionGap;

      // ── 4. PASSENGER DETAILS ────────────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#374151')
        .text('PASSENGERS', margin, currentY);
      currentY += 14;

      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .lineWidth(0.5)
        .strokeColor('#d1d5db')
        .stroke();
      currentY += 8;

      const passengers = booking.passengers || [];
      passengers.forEach((pax, i) => {
        const nameStr = `${i + 1}. ${pax.firstName || ''} ${pax.lastName || ''}`.trim();
        const typeStr = pax.type ? pax.type.charAt(0).toUpperCase() + pax.type.slice(1) : '';
        const seatStr = `Seat: ${pax.seatNumber || 'TBA'}`;
        const mealStr = `Meal: ${pax.mealPreference || 'standard'}`;

        doc
          .font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#111827')
          .text(nameStr, labelX, currentY);
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#6b7280')
          .text(typeStr, labelX + 160, currentY);
        doc.text(seatStr, labelX + 230, currentY);
        doc.text(mealStr, labelX + 320, currentY);
        currentY += rowH;
      });

      currentY += sectionGap;

      // ── 5. FARE SUMMARY ─────────────────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#374151')
        .text('FARE SUMMARY', margin, currentY);
      currentY += 14;

      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .lineWidth(0.5)
        .strokeColor('#d1d5db')
        .stroke();
      currentY += 8;

      const fareValueX = pageWidth - margin - 120;

      const addFareRow = (label, value, bold = false, color = '#111827') => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor('#6b7280')
          .text(label, labelX, currentY);
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor(color)
          .text(value, fareValueX, currentY, { align: 'right', width: 100 });
        currentY += rowH;
      };

      const basePriceNum = Number(pricing.basePrice) || 0;
      const taxesNum = Number(pricing.taxes) || 0;
      const feesNum = Number(pricing.fees) || 0;
      const extrasNum = Number(pricing.extras) || 0;
      const discountNum = Number(pricing.discount) || 0;
      const totalNum = Number(pricing.totalAmount) || 0;

      const fuelSurcharge = feesNum - CONVENIENCE_FEE;

      addFareRow('Base Fare', `₹${basePriceNum.toLocaleString('en-IN')}`);
      addFareRow('Taxes & Fees (18% GST)', `₹${taxesNum.toLocaleString('en-IN')}`);
      addFareRow(
        'Fuel Surcharge',
        `₹${(fuelSurcharge > 0 ? fuelSurcharge : 0).toLocaleString('en-IN')}`
      );
      addFareRow('Convenience Fee', `₹${CONVENIENCE_FEE.toLocaleString('en-IN')}`);

      if (extrasNum > 0) {
        addFareRow('Extras', `₹${extrasNum.toLocaleString('en-IN')}`);
      }
      if (discountNum > 0) {
        addFareRow('Discount', `- ₹${discountNum.toLocaleString('en-IN')}`, false, '#16a34a');
      }

      // Bold divider
      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .lineWidth(1)
        .strokeColor('#374151')
        .stroke();
      currentY += 6;

      // Total
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#111827')
        .text('TOTAL AMOUNT', labelX, currentY);
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#2563eb')
        .text(`₹${totalNum.toLocaleString('en-IN')}`, fareValueX, currentY, {
          align: 'right',
          width: 100,
        });
      currentY += 22;
      currentY += sectionGap;

      // ── 6. IMPORTANT INFORMATION ────────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#374151')
        .text('IMPORTANT INFORMATION', margin, currentY);
      currentY += 14;

      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .lineWidth(0.5)
        .strokeColor('#d1d5db')
        .stroke();
      currentY += 8;

      const infoItems = [
        'Online check-in opens 48 hours before departure',
        'Arrive at airport 2 hours before for domestic, 3 hours for international flights',
        `Carry-on baggage: ${baggage.cabin || 7}kg, Checked: ${baggage.checked || 20}kg`,
        'Carry a valid government-issued photo ID or passport',
      ];

      infoItems.forEach((item) => {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#374151')
          .text(`•  ${item}`, margin + 8, currentY, { width: contentWidth - 8 });
        currentY += rowH;
      });

      // ── 7. QR CODE ──────────────────────────────────────────────────────────
      try {
        const qrBuffer = await QRCode.toBuffer(booking.bookingReference || 'N/A', {
          type: 'png',
          width: 80,
        });
        const qrX = doc.page.width - 120;
        const qrY = doc.page.height - 140;
        doc.image(qrBuffer, qrX, qrY, { width: 80 });
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor('#6b7280')
          .text('Scan for booking', qrX, qrY + 84, { width: 80, align: 'center' });
      } catch (qrErr) {
        // QR generation failed — skip silently
      }

      // ── 8. FOOTER ───────────────────────────────────────────────────────────
      const footerY = doc.page.height - 45;
      doc
        .moveTo(margin, footerY)
        .lineTo(pageWidth - margin, footerY)
        .lineWidth(0.5)
        .strokeColor('#d1d5db')
        .stroke();

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#9ca3af')
        .text(
          'Thank you for booking with FlightBook. For support: support@flightbook.com',
          margin,
          footerY + 8,
          { align: 'center', width: contentWidth }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateBookingPDF };
