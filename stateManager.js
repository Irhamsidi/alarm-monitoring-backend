class StateManager {
  constructor() {
    this.firingAlerts = new Map();
    this.alarmState = "idle"; // idle | playing | acknowledged
  }

  // Firing Alerts Method
  addAlert(fingerprint, details) {
    this.firingAlerts.set(fingerprint, details);
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

  getAlertsList() {
    return Array.from(this.firingAlerts.values());
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
