class StateManager {
  constructor() {
    this.firingAlerts = new Set();
    this.alarmState = "idle"; // idle | playing | acknowledged
  }

  // Firing Alerts Method
  addAlert(fingerprint) {
    this.firingAlerts.add(fingerprint);
  }

  removeAlert(fingerprint) {
    return this.firingAlerts.delete(fingerprint);
  }

  hasAlert(fingerprint) {
    return this.firingAlerts.has(fingerprint);
  }

  getAlertCount() {
    return this.firingAlerts.size;
  }

  getAlertsArray() {
    return Array.from(this.firingAlerts);
  }

  clearAlerts() {
    this.firingAlerts.clear();
  }

  // Alarm State Method
  getState() {
    return this.alarmState;
  }

  setState(newState) {
    const validStates = ["idle", "playing", "acknowledged"];
    if (validStates.includes(newState)) {
      this.alarmState = newState;
    }
  }
}

module.exports = new StateManager();
