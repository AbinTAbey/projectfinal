// Demo monitoring system for testing
class DemoMonitoring {
    constructor() {
        this.cheatingEvents = [
            {
                type: 'face_not_visible',
                message: 'Face not detected. Please keep your face visible to the camera.',
                severity: 'medium'
            },
            {
                type: 'looking_away',
                message: 'Looking away from screen detected. Please focus on the exam.',
                severity: 'low'
            },
            {
                type: 'multiple_faces',
                message: 'Multiple faces detected in frame.',
                severity: 'high'
            },
            {
                type: 'phone_detected',
                message: 'Mobile phone or electronic device detected.',
                severity: 'high'
            },
            {
                type: 'talking_detected',
                message: 'Talking or audio detected. Please maintain silence.',
                severity: 'medium'
            },
            {
                type: 'background_noise',
                message: 'Unusual background noise detected.',
                severity: 'low'
            }
        ];
        
        this.currentEventIndex = 0;
        this.interval = null;
    }
    
    start() {
        console.log('Starting demo monitoring...');
        
        // Simulate random cheating events every 20-40 seconds
        this.interval = setInterval(() => {
            if (Math.random() < 0.3) { // 30% chance
                this.triggerCheatingEvent();
            }
        }, 20000 + Math.random() * 20000);
    }
    
    triggerCheatingEvent() {
        if (this.currentEventIndex >= this.cheatingEvents.length) {
            this.currentEventIndex = 0;
        }
        
        const event = this.cheatingEvents[this.currentEventIndex];
        this.currentEventIndex++;
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('cheatingDetected', {
            detail: event
        }));
        
        console.log('Cheating detected:', event);
        
        return event;
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

// Initialize demo monitoring
const demoMonitor = new DemoMonitoring();

// Listen for cheating events
window.addEventListener('cheatingDetected', (event) => {
    if (window.detectCheating) {
        window.detectCheating(event.detail.type, event.detail.message);
    }
});

// Start monitoring after page loads
window.addEventListener('load', () => {
    setTimeout(() => {
        demoMonitor.start();
    }, 5000);
});