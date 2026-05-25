<template>
  <div class="app-container">
    <!-- Platform Brand Header -->
    <header class="app-header">
      <div class="header-brand">
        <div class="brand-icon-wrapper">
          <i class="fa-solid fa-bolt brand-icon"></i>
        </div>
        <div class="brand-text">
          <h1>HESCO Utility Hub</h1>
          <p>Anti-bot Secure Real-Time Bulk Scraping Console</p>
        </div>
      </div>
      
      <div class="status-indicator">
        <span class="status-dot"></span>
        <span>Operational</span>
      </div>
    </header>

    <!-- Main Workspace Layout -->
    <main class="app-layout">
      <!-- Left Sidebar Panel -->
      <aside class="sidebar">
        <div class="ui-card">
          <h3><i class="fa-solid fa-magnifying-glass"></i> Retrieve Ledgers</h3>
          <p class="helper-text">Enter 14-digit reference numbers (one per line or separated by commas).</p>
          
          <form @submit.prevent="fetchBills">
            <textarea 
              v-model="refInputs" 
              placeholder="e.g. 15371411513106"
              required
              :disabled="isSubmitting"
            ></textarea>

            <!-- Quick Reference Capsule Chips -->
            <div class="ref-chips-grid">
              <label class="chips-label">Quick Selection:</label>
              <div class="chips-list">
                <button 
                  type="button" 
                  v-for="chip in quickChips" 
                  :key="chip.ref" 
                  @click="addRefChip(chip.ref)" 
                  class="chip-capsule"
                  :disabled="isSubmitting"
                >
                  <i class="fa-solid fa-plus-circle"></i> {{ chip.label }}
                </button>
              </div>
            </div>
            
            <div class="form-buttons">
              <button 
                type="button" 
                @click="loadDemo" 
                class="btn btn-secondary"
                :disabled="isSubmitting"
              >
                Reset Demo
              </button>
              <button 
                type="submit" 
                class="btn btn-primary"
                :disabled="isSubmitting"
              >
                <i v-if="!isSubmitting" class="fa-solid fa-cloud-arrow-down"></i>
                <span v-else class="btn-spinner"></span>
                {{ isSubmitting ? 'Syncing...' : 'Fetch Ledgers' }}
              </button>
            </div>
          </form>
        </div>

        <div class="ui-card mini-card">
          <h4><i class="fa-solid fa-shield-halved"></i> Active Handshake</h4>
          <p class="small-text">Secures real-time session tokens and automatically bypasses anti-forgery anti-bot validation checkpoints.</p>
        </div>
      </aside>

      <!-- Right Workspace Panel -->
      <section class="results-area">
        <!-- Welcome state -->
        <div v-if="viewMode === 'welcome'" class="empty-state">
          <i class="fa-solid fa-receipt empty-icon"></i>
          <h3>Utility Workspace Idle</h3>
          <p>Please enter reference numbers on the left or select a quick capsule to automatically scrape, parse, and verify active HESCO utility accounts.</p>
        </div>

        <!-- Glowing Loader View -->
        <div v-else-if="viewMode === 'loading'" class="loading-state">
          <div class="glow-spinner-wrapper">
            <div class="glow-spinner"></div>
          </div>
          <h3>System Handshake In Progress...</h3>
          <p>{{ loadingMessage }}</p>
        </div>

        <!-- Loaded Platforms Dashboard -->
        <div v-else-if="viewMode === 'dashboard'" class="dashboard-content">
          
          <!-- Unified Statistics Banner -->
          <div class="stats-row">
            <div class="stat-box">
              <label>Accounts Loaded</label>
              <span>{{ loadedBillsData.length }}</span>
            </div>
            <div class="stat-box">
              <label>Accumulated Units</label>
              <span>{{ totalUnits.toLocaleString() }} <small style="font-size: 0.7rem; color: var(--text-muted);">kWh</small></span>
            </div>
            <div class="stat-box">
              <label>Total Outstanding</label>
              <span>Rs. {{ totalPayable.toLocaleString() }}</span>
            </div>
            <div class="stat-box">
              <label>Cleared Accounts</label>
              <span>{{ paidCount }} / {{ loadedBillsData.length }}</span>
            </div>
          </div>

          <!-- Toolbar Actions -->
          <div class="results-header">
            <h2>Monitored Accounts Ledgers</h2>
            <div class="toolbar-actions">
              <button @click="exportJson" class="btn-small">
                <i class="fa-solid fa-file-export"></i> Export JSON
              </button>
              <button @click="triggerPrint" class="btn-small">
                <i class="fa-solid fa-print"></i> Print Documents
              </button>
            </div>
          </div>

          <!-- Dashboard Ledger Stack -->
          <div class="cards-stack">
            <div 
              v-for="bill in loadedBillsData" 
              :key="bill.referenceNumber" 
              class="bill-record-card"
              :class="bill.status === 'success' && bill.data ? (bill.data.paymentSummary.isPaid ? 'paid-glow' : 'unpaid-glow') : 'error-card'"
            >
              <!-- Success Card Layout -->
              <template v-if="bill.status === 'success' && bill.data">
                
                <!-- CASE A: Security Setup Prompt (No PIN exists yet) -->
                <div v-if="!bill.hasPin" class="card-lock-overlay">
                  <i class="fa-solid fa-shield-halved lock-badge-icon setup-mode"></i>
                  <div class="lock-details">
                    <h4>Configure Security PIN Setup</h4>
                    <p>Ref: {{ formatRefNumber(bill.referenceNumber) }} &bull; {{ bill.data.consumerInfo.name }}</p>
                    <p style="margin-top: 0.5rem; font-size: 0.78rem; color: var(--text-muted); max-width: 440px;">
                      A secure PIN is required to lock and protect this line's billing records and tracking logs. Once configured, only users who enter this PIN will be able to manage physical logs, view historical changes, or review bill breakdowns.
                    </p>
                  </div>
                  <div class="lock-input-group">
                    <input 
                      type="password" 
                      maxlength="10"
                      class="lock-pin-input" 
                      placeholder="Set 4+ digit PIN..."
                      v-model="pinSetupInputs[bill.referenceNumber]"
                      @keydown.enter="setupAccountPin(bill.referenceNumber)"
                    />
                    <button 
                      class="lock-submit-btn setup-mode" 
                      @click="setupAccountPin(bill.referenceNumber)"
                    >
                      <i class="fa-solid fa-lock"></i> Setup PIN
                    </button>
                  </div>
                </div>

                <!-- CASE B: Locked State Prompt (PIN exists but not unlocked yet) -->
                <div v-else-if="bill.hasPin && !unlockedRefsMap[bill.referenceNumber]" class="card-lock-overlay">
                  <i class="fa-solid fa-lock lock-badge-icon"></i>
                  <div class="lock-details">
                    <h4>Account Security Shield Active</h4>
                    <p>Ref: {{ formatRefNumber(bill.referenceNumber) }} &bull; {{ bill.data.consumerInfo.name }}</p>
                    <p style="margin-top: 0.25rem;">This utility line is secured. Enter your PIN to access the billing console and history checklists.</p>
                  </div>
                  <div class="lock-input-group">
                    <input 
                      type="password" 
                      maxlength="10"
                      class="lock-pin-input" 
                      placeholder="Enter PIN..."
                      v-model="pinInputs[bill.referenceNumber]"
                      @keydown.enter="unlockAccountCard(bill.referenceNumber)"
                    />
                    <button 
                      class="lock-submit-btn" 
                      @click="unlockAccountCard(bill.referenceNumber)"
                    >
                      <i class="fa-solid fa-key"></i> Unlock Card
                    </button>
                  </div>
                </div>

                <!-- CASE C: Unlocked State (Render full details) -->
                <template v-else>
                  <div 
                    class="payment-status-badge"
                    :class="bill.data.paymentSummary.isPaid ? 'paid' : 'unpaid'"
                  >
                    {{ bill.data.paymentSummary.isPaid ? 'Paid' : 'Unpaid' }}
                  </div>

                  <!-- Info Column (Left) -->
                  <div class="bill-info-panel">
                    <div class="bill-consumer-header">
                      <div class="bill-ref-sub">
                        Ref: {{ formatRefNumber(bill.data.consumerInfo.referenceNumber) }} &bull; {{ bill.data.consumerInfo.tariff }}
                      </div>
                      <h3>{{ bill.data.consumerInfo.name }}</h3>
                      <div class="bill-address">
                        <i class="fa-solid fa-location-dot"></i> {{ bill.data.consumerInfo.address }}
                      </div>
                    </div>
                    
                    <div class="bill-details-grid">
                      <div class="grid-field">
                        <label>Consumer ID</label>
                        <span>{{ bill.data.consumerInfo.consumerId || 'N/A' }}</span>
                      </div>
                      <div class="grid-field">
                        <label>Sanctioned Load</label>
                        <span>{{ bill.data.consumerInfo.load || 'N/A' }}</span>
                      </div>
                      <div class="grid-field">
                        <label>Billing Month</label>
                        <span>{{ bill.data.billDetails.billMonth || 'N/A' }}</span>
                      </div>
                      <div class="grid-field">
                        <label>Payment Due</label>
                        <span>{{ bill.data.billDetails.dueDate || 'N/A' }}</span>
                      </div>
                      <div class="grid-field">
                        <label>Previous Reading</label>
                        <span class="mono-text">{{ bill.data.meterDetails.previousReading }}</span>
                      </div>
                      <div class="grid-field">
                        <label>Present Reading</label>
                        <span class="mono-text">{{ bill.data.meterDetails.presentReading }}</span>
                      </div>
                    </div>
                    
                    <!-- Segmented Meter Bar by Consumption Brackets -->
                    <div class="consumption-tracker">
                      <div class="tracker-labels">
                        <span>Consumption Intensity</span>
                        <span>{{ getParsedUnits(bill.data.meterDetails.unitsConsumed) }} Units</span>
                      </div>
                      
                      <!-- Futuristic Segmented Progress Gauge -->
                      <div class="bracket-gauge-container">
                        <div class="bracket-gauge-segments">
                          <div class="gauge-segment low-bracket" :class="{ active: getParsedUnits(bill.data.meterDetails.unitsConsumed) <= 100 }">
                            <span>0-100</span>
                          </div>
                          <div class="gauge-segment mid-bracket" :class="{ active: getParsedUnits(bill.data.meterDetails.unitsConsumed) > 100 && getParsedUnits(bill.data.meterDetails.unitsConsumed) <= 300 }">
                            <span>101-300</span>
                          </div>
                          <div class="gauge-segment high-bracket" :class="{ active: getParsedUnits(bill.data.meterDetails.unitsConsumed) > 300 }">
                            <span>301+</span>
                          </div>
                        </div>
                        
                        <!-- Precise Fill Bar underneath -->
                        <div class="tracker-bar">
                          <div class="tracker-fill" :style="{ width: getUnitsPercentage(bill.data.meterDetails.unitsConsumed) + '%' }"></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Cost Breakdown Column (Invoice styled) -->
                  <div class="bill-cost-panel">
                    <div class="cost-breakdown-list">
                      <div class="cost-header-row">
                        <span>Line Items</span>
                        <span>Amount</span>
                      </div>
                      <div class="cost-row">
                        <span><i class="fa-solid fa-bolt"></i> Electricity Cost</span>
                        <span>Rs. {{ bill.data.chargesBreakdown.costOfElectricity || '0' }}</span>
                      </div>
                      <div class="cost-row">
                        <span><i class="fa-solid fa-file-invoice-dollar"></i> Sales Tax (GST)</span>
                        <span>Rs. {{ bill.data.chargesBreakdown.gst || '0' }}</span>
                      </div>
                      <div class="cost-row">
                        <span><i class="fa-solid fa-gas-pump"></i> Fuel Adjustment (FPA)</span>
                        <span>Rs. {{ bill.data.chargesBreakdown.fuelPriceAdjustment || '0' }}</span>
                      </div>
                      <div class="cost-row">
                        <span><i class="fa-solid fa-scale-balanced"></i> Qtr Adjustment</span>
                        <span>Rs. {{ bill.data.chargesBreakdown.qtrTariffAdj || '0' }}</span>
                      </div>
                      <div class="cost-row">
                        <span><i class="fa-solid fa-hand-holding-dollar"></i> Surcharges</span>
                        <span>Rs. {{ bill.data.chargesBreakdown.fcSurcharge || '0' }}</span>
                      </div>
                      <div class="cost-row">
                        <span><i class="fa-solid fa-landmark"></i> Gov Taxes & Duties</span>
                        <span>Rs. {{ bill.data.chargesBreakdown.electricityDuty || '0' }}</span>
                      </div>
                      <div class="cost-row total-bill-row">
                        <span>Total Payable</span>
                        <span>Rs. {{ getCleanPayable(bill.data.paymentSummary.payableWithinDue).toLocaleString() }}</span>
                      </div>
                    </div>
                    
                    <div 
                      v-if="bill.data.paymentSummary.isPaid"
                      class="payment-notification"
                    >
                      <i class="fa-solid fa-circle-check"></i> Paid Rs. {{ bill.data.paymentSummary.amountPaid }} on {{ bill.data.paymentSummary.paymentDate }}
                    </div>
                    <div 
                      v-else
                      class="payment-notification unpaid-notice"
                    >
                      <i class="fa-solid fa-circle-exclamation"></i> Due: {{ bill.data.paymentSummary.payableAfterDueDetails || 'Unpaid' }}
                    </div>
                  </div>

                  <!-- Integrated Inline Live Meter Tracker (Bottom Span) -->
                  <div class="card-tracker-section">
                    <div class="tracker-header-inline">
                      <i class="fa-solid fa-gauge-high"></i>
                      <span>Live Meter Tracker & Simulator (SQLite Persisted)</span>
                    </div>

                    <div class="tracker-input-row">
                      <!-- Previous Present Reading Context -->
                      <div class="tracker-reference-readout">
                        <span>Reference Present Reading:</span>
                        <span>{{ bill.data.meterDetails.presentReading }}</span>
                      </div>

                      <!-- Input Elements -->
                      <div class="tracker-input-wrapper">
                        <input 
                          type="number" 
                          class="tracker-number-input" 
                          placeholder="Current physical meter reading..."
                          v-model="meterInputMap[bill.referenceNumber]"
                          :min="getCleanPresentReading(bill.data.meterDetails.presentReading)"
                          @keydown.enter="logMeterReading(bill.referenceNumber, getCleanPresentReading(bill.data.meterDetails.presentReading))"
                        />
                        <button 
                          class="tracker-add-btn" 
                          type="button"
                          @click="logMeterReading(bill.referenceNumber, getCleanPresentReading(bill.data.meterDetails.presentReading))"
                        >
                          <i class="fa-solid fa-plus"></i> Save & Log
                        </button>
                      </div>
                    </div>

                    <!-- Real-Time Cost Estimator Sandboxes -->
                    <div v-if="meterInputMap[bill.referenceNumber]" class="dynamic-estimator-sandbox">
                      <div class="sandbox-header">
                        <i class="fa-solid fa-calculator"></i> Real-time Bill Estimate (Preview)
                      </div>
                      <div class="sandbox-grid">
                        <div class="sandbox-field">
                          <label>Simulated Consumed Units</label>
                          <span class="highlight-val">+{{ Math.max(0, parseInt(meterInputMap[bill.referenceNumber]) - getCleanPresentReading(bill.data.meterDetails.presentReading)) }} Units</span>
                        </div>
                        <div class="sandbox-field">
                          <label>Estimated Charge (Inc. Tax & Duty)</label>
                          <span class="highlight-cost">Rs. {{ getEstimatedCost(Math.max(0, parseInt(meterInputMap[bill.referenceNumber]) - getCleanPresentReading(bill.data.meterDetails.presentReading))) }}</span>
                        </div>
                      </div>
                      <p class="small-text"><i class="fa-solid fa-info-circle"></i> Estimated using HESCO residential multi-bracket pricing blocks + estimated 28% surcharges/GST.</p>
                    </div>

                    <!-- Calculation History Logs -->
                    <div class="tracker-history-inline">
                      <div 
                        v-for="(item, index) in getCalcHistory(bill.referenceNumber)" 
                        :key="index"
                        class="history-item"
                      >
                        <div class="history-item-left">
                          <span class="reading-calc">Reading Logged: {{ item.enteredReading }}</span>
                          <span class="time-calc"><i class="fa-regular fa-clock"></i> {{ item.timestamp }}</span>
                        </div>
                        <div class="history-item-right">
                          <span class="units-calc">+{{ item.consumedUnits }} Units</span>
                          <button 
                            class="btn-delete-log" 
                            title="Delete Entry" 
                            @click="deleteMeterLog(bill.referenceNumber, item.id)"
                          >
                            <i class="fa-solid fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                      
                      <div 
                        v-if="getCalcHistory(bill.referenceNumber).length === 0"
                        class="tracker-history-empty"
                      >
                        <i class="fa-solid fa-inbox"></i>
                        <span>No entries logged. Enter physical meter reading above to record a checked checkpoint.</span>
                      </div>
                    </div>
                  </div>
                </template>

              </template>

              <!-- Failure Card Layout -->
              <template v-else>
                <div class="error-details">
                  <i class="fa-solid fa-triangle-exclamation"></i>
                  <div class="error-text-block">
                    <h4>Sync Failure: Reference {{ formatRefNumber(bill.referenceNumber) }}</h4>
                    <p>{{ bill.error || "HESCO database connection timed out. Verify your 14-digit reference key." }}</p>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>
    </main>

  </div>

  <!-- Dynamic Toast Alerts Stack -->
  <div class="toasts-container">
    <div 
      v-for="toast in toasts" 
      :key="toast.id" 
      class="toast-popup"
      :class="toast.type"
    >
      <span>{{ toast.message }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

// --- State Variables ---
const refInputs = ref("15371411546100, 15371411513100, 15371411513106");
const loadedBillsData = ref([]);
const viewMode = ref("welcome"); // welcome, loading, dashboard
const loadingMessage = ref("Connecting to secure scraper gateway...");
const isSubmitting = ref(false);

const toasts = ref([]);
let toastIdCounter = 0;

// Capsule chips selection shortcuts
const quickChips = [
  { ref: "15371411546100", label: "Line 1 (Demo)" },
  { ref: "15371411513100", label: "Line 2 (Demo)" },
  { ref: "15371411513106", label: "Serwan (Demo)" }
];

// Inline calculation inputs and histories maps
const meterInputMap = ref({});
const historyLogsMap = ref({});

// --- Account PIN Security Reactive Map Variables ---
const unlockedRefsMap = ref({});
const pinInputs = ref({});
const pinSetupInputs = ref({});
const activePins = ref({});

// --- Computed Stats ---
const totalUnits = computed(() => {
  let sum = 0;
  loadedBillsData.value.forEach(bill => {
    if (bill.status === 'success' && bill.data) {
      sum += getParsedUnits(bill.data.meterDetails.unitsConsumed);
    }
  });
  return sum;
});

const totalPayable = computed(() => {
  let sum = 0;
  loadedBillsData.value.forEach(bill => {
    if (bill.status === 'success' && bill.data) {
      sum += getCleanPayable(bill.data.paymentSummary.payableWithinDue);
    }
  });
  return sum;
});

const paidCount = computed(() => {
  let count = 0;
  loadedBillsData.value.forEach(bill => {
    if (bill.status === 'success' && bill.data && bill.data.paymentSummary.isPaid) {
      count++;
    }
  });
  return count;
});

// --- Utility Formatters ---
const formatRefNumber = (refStr) => {
  const cleaned = String(refStr || '').replace(/[^0-9]/g, '');
  if (cleaned.length === 14) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7, 14)}`;
  }
  return refStr;
};

const getParsedUnits = (unitsStr) => {
  return parseInt(String(unitsStr || '0').replace(/[^0-9]/g, '')) || 0;
};

const getCleanPresentReading = (readingStr) => {
  return parseInt(String(readingStr || '0').replace(/[^0-9]/g, '')) || 0;
};

const getCleanPayable = (payableStr) => {
  return parseInt(String(payableStr || '0').replace(/[^0-9]/g, '')) || 0;
};

const getUnitsPercentage = (unitsStr) => {
  const units = getParsedUnits(unitsStr);
  const maxUnitsReference = 400;
  return Math.min(100, Math.max(5, (units / maxUnitsReference) * 100));
};

// Quick Selection chips additions
const addRefChip = (refNo) => {
  if (isSubmitting.value) return;
  const currentInputs = refInputs.value.split(/[\n,]/).map(r => r.trim()).filter(Boolean);
  if (!currentInputs.includes(refNo)) {
    currentInputs.push(refNo);
    refInputs.value = currentInputs.join(", ");
    showToast(`Reference ${refNo} appended.`);
  } else {
    showToast("Reference key is already added.", "error");
  }
};

// Pakistani Residential Pricing Bracket Formulas
const getEstimatedCost = (units) => {
  if (!units || units <= 0) return 0;
  let cost = 0;
  
  if (units <= 100) {
    cost = units * 16.48;
  } else if (units <= 200) {
    cost = (100 * 16.48) + ((units - 100) * 22.95);
  } else if (units <= 300) {
    cost = (100 * 16.48) + (100 * 22.95) + ((units - 200) * 29.14);
  } else {
    cost = (100 * 16.48) + (100 * 22.95) + (100 * 29.14) + ((units - 300) * 38.56);
  }
  
  // Tax + surcharges markup factor (approx 28% extra)
  return Math.round(cost * 1.28);
};

// --- Per-Account PIN Setup & Verification Handlers ---
const setupAccountPin = async (refNo) => {
  const rawPin = pinSetupInputs.value[refNo];
  if (!rawPin || String(rawPin).trim().length < 4) {
    showToast("Setup PIN must contain at least 4 characters.", "error");
    return;
  }

  const pinCode = String(rawPin).trim();
  try {
    const res = await $fetch('/api/tracker-security', {
      method: 'POST',
      body: {
        action: 'setup',
        referenceNumber: refNo,
        pin: pinCode
      }
    });

    if (res.success) {
      // Mark as unlocked for the current session
      unlockedRefsMap.value[refNo] = true;
      activePins.value[refNo] = pinCode;
      
      // Update card metadata in memory
      const bill = loadedBillsData.value.find(b => b.referenceNumber === refNo);
      if (bill) {
        bill.hasPin = true;
      }

      pinSetupInputs.value[refNo] = "";
      showToast("Security PIN configured successfully.");

      // Refresh logs list using the unlocked PIN
      await refreshAllLogs();
    }
  } catch (error) {
    console.error("Failed to setup security PIN:", error);
    showToast(error.data?.statusMessage || "Failed to set up PIN.", "error");
  }
};

const unlockAccountCard = async (refNo) => {
  const rawPin = pinInputs.value[refNo];
  if (!rawPin) {
    showToast("Please enter your security PIN.", "error");
    return;
  }

  const pinCode = String(rawPin).trim();
  try {
    const res = await $fetch('/api/tracker-security', {
      method: 'POST',
      body: {
        action: 'verify',
        referenceNumber: refNo,
        pin: pinCode
      }
    });

    if (res.success) {
      unlockedRefsMap.value[refNo] = true;
      activePins.value[refNo] = pinCode;
      pinInputs.value[refNo] = "";
      showToast("Access granted. Dashboard unlocked.");

      // Refresh logs list using the unlocked PIN
      await refreshAllLogs();
    }
  } catch (error) {
    console.error("Failed to unlock card:", error);
    showToast(error.data?.statusMessage || "Incorrect security PIN. Access denied.", "error");
  }
};

// --- SQLite Database History Logs Handlers ---
const refreshAllLogs = async () => {
  if (loadedBillsData.value.length === 0) return;
  
  const tempLogs = {};
  for (const bill of loadedBillsData.value) {
    if (bill.status === 'success') {
      const refNo = bill.referenceNumber;
      
      const hasPinConfig = bill.hasPin;
      const isUnlocked = unlockedRefsMap.value[refNo];
      const pinToken = activePins.value[refNo] || '';

      // Skip fetching logs on locked cards to secure backend queries
      if (hasPinConfig && !isUnlocked) {
        tempLogs[refNo] = [];
        continue;
      }

      try {
        const data = await $fetch(`/api/tracker-history?ref=${refNo}&pin=${pinToken}`);
        tempLogs[refNo] = data || [];
      } catch (e) {
        console.error(`Failed to fetch database logs for ref ${refNo}:`, e);
        tempLogs[refNo] = [];
      }
    }
  }
  historyLogsMap.value = tempLogs;
};

const getCalcHistory = (refNo) => {
  return historyLogsMap.value[refNo] || [];
};

const logMeterReading = async (refNo, presentReadingVal) => {
  const inputVal = meterInputMap.value[refNo];
  if (!inputVal) {
    showToast("Provide physical meter units to log.", "error");
    return;
  }
  
  const currentUnits = parseInt(inputVal) || 0;
  if (currentUnits < presentReadingVal) {
    showToast(`Reading cannot fall below present bill reading (${presentReadingVal}).`, "error");
    return;
  }
  
  const pinToken = activePins.value[refNo] || '';

  try {
    const result = await $fetch('/api/tracker-history', {
      method: 'POST',
      body: {
        referenceNumber: refNo,
        enteredReading: currentUnits,
        presentReading: presentReadingVal,
        pin: pinToken
      }
    });

    meterInputMap.value[refNo] = "";
    
    // Refresh records from SQLite database
    await refreshAllLogs();
    showToast(`Saved to SQLite: Reading ${result.enteredReading} (+${result.consumedUnits} units).`);
  } catch (error) {
    console.error("Failed to post log checkpoint:", error);
    showToast(error.data?.statusMessage || "Failed to persist reading to database.", "error");
  }
};

const deleteMeterLog = async (refNo, dbId) => {
  if (dbId === undefined) return;
  
  const pinToken = activePins.value[refNo] || '';

  try {
    await $fetch('/api/tracker-history', {
      method: 'DELETE',
      body: { 
        id: dbId,
        referenceNumber: refNo,
        pin: pinToken
      }
    });
    
    // Refresh records from SQLite database
    await refreshAllLogs();
    showToast("Log entry purged from SQLite.");
  } catch (error) {
    console.error("Failed to delete log checkpoint:", error);
    showToast(error.data?.statusMessage || "Failed to delete reading from database.", "error");
  }
};

// --- Sync & Operations Handlers ---
const loadDemo = () => {
  refInputs.value = "15371411546100, 15371411513100, 15371411513106";
  showToast("Demo query loaded.");
};

const showToast = (message, type = "success") => {
  const id = ++toastIdCounter;
  toasts.value.push({ id, message, type });
  
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 3300);
};

const fetchBills = async () => {
  const refNumbers = refInputs.value
    .split(/[\n,]/)
    .map(num => num.replace(/[^0-9]/g, '').trim())
    .filter(num => num.length >= 10);
    
  if (refNumbers.length === 0) {
    showToast("Provide at least one 10-14 digit reference number.", "error");
    return;
  }

  if (refNumbers.length > 10) {
    showToast("Scraper queries capped at 10 concurrent references.", "error");
    return;
  }

  isSubmitting.value = true;
  viewMode.value = "loading";
  
  const messages = [
    "Establishing secure handshake with Pitc gateway...",
    "Resolving anti-bot browser checks...",
    "Querying utility ledger databases...",
    "Parsing invoice charges & meter lists..."
  ];
  
  let msgIndex = 0;
  loadingMessage.value = messages[0];
  const msgInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % messages.length;
    loadingMessage.value = messages[msgIndex];
  }, 2000);

  try {
    const results = await $fetch('/api/fetch-bills', {
      method: 'POST',
      body: { referenceNumbers: refNumbers }
    });

    clearInterval(msgInterval);
    isSubmitting.value = false;

    if (!Array.isArray(results)) {
      throw new Error("Invalid response received from utility API.");
    }

    loadedBillsData.value = results;

    // Explicitly initialize key bindings to empty strings to prevent Vue v-model undefined evaluations
    results.forEach(bill => {
      if (bill.status === 'success') {
        const refNo = bill.referenceNumber;
        if (pinSetupInputs.value[refNo] === undefined) {
          pinSetupInputs.value[refNo] = "";
        }
        if (pinInputs.value[refNo] === undefined) {
          pinInputs.value[refNo] = "";
        }
      }
    });

    viewMode.value = "dashboard";
    
    // Refresh records from SQLite database (handling pins dynamically)
    await refreshAllLogs();
    
    const successfulBills = results.filter(b => b.status === 'success').length;
    showToast(`Sync complete: Loaded ${successfulBills} of ${results.length} lines.`);

  } catch (error) {
    clearInterval(msgInterval);
    isSubmitting.value = false;
    viewMode.value = "welcome";
    showToast(error.data?.statusMessage || error.message || "Gateway error. Please re-run bulk scraping.", "error");
  }
};

const exportJson = () => {
  if (loadedBillsData.value.length === 0) return;
  
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(loadedBillsData.value, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `hesco_workspace_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast("Workspace exported.");
};

const triggerPrint = () => {
  window.print();
};
</script>

<style scoped>
.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: white;
  border-radius: 50%;
  animation: rotate-spinner 0.6s linear infinite;
  display: inline-block;
  margin-right: 0.35rem;
}
</style>
