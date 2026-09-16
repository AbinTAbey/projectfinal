/**
 * ProctorVision AI Detection Engine (Client-Side)
 * Handles video/audio capture and sends to backend for AI processing
 */

import { DETECTION_CONFIG } from './detection-config.js';

class AIDetectionEngine {
    constructor(submissionId, apiBaseUrl, token) {
        this.submissionId = submissionId;
        this.apiBaseUrl = apiBaseUrl;
        this.token = token;
        
        // Media streams
        this.videoStream = null;
        this.audioStream = null;
        this.videoElement = null;
        
        // Detection state
        this.isActive = false;
        this.warningCount = DETECTION_CONFIG.warnings.initial;
        this.violations = [];
        
        // Processing intervals
        this.frameProcessingInterval = null;
        this.audioProcessingInterval = null;
        this.tabSwitchListener = null;
        
        // Canvas for frame capture
        this.canvas = document.createElement('canvas');
        this.canvasContext = this.canvas.getContext('2d');
        
        // Callbacks
        this.onViolation = null;
        this.onWarningUpdate = null;
        this.onAutoSubmit = null;
        
        console.log('🤖 AI Detection Engine initialized');
    }
    
    /**
     * Initialize camera and microphone
     */
    async initialize(videoElementId) {
        try {
            console.log('🎥 Requesting camera and microphone access...');
            
            // Request media permissions
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user',
                    frameRate: { ideal: 15 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                }
            });
            
            // Get audio track separately for processing
            this.audioStream = this.videoStream;
            
            // Display video
            this.videoElement = document.getElementById(videoElementId);
            if (this.videoElement) {
                this.videoElement.srcObject = this.videoStream;
                this.videoElement.play();
            }
            
            console.log('✅ Camera and microphone access granted');
            return true;
            
        } catch (error) {
            console.error('❌ Media access error:', error);
            throw new Error('Camera and microphone access required for the exam');
        }
    }
    
    /**
     * Start AI-powered monitoring
     */
    start() {
        if (this.isActive) {
            console.warn('Detection already active');
            return;
        }
        
        this.isActive = true;
        console.log('🚀 Starting AI detection...');
        
        // 1. Process video frames (every 2 seconds)
        this.frameProcessingInterval = setInterval(() => {
            this.processVideoFrame();
        }, 2000);
        
        // 2. Process audio (every 3 seconds)
        this.audioProcessingInterval = setInterval(() => {
            this.processAudio();
        }, 3000);
        
        // 3. Monitor tab switching
        this.setupTabSwitchDetection();
        
        // 4. Prevent right-click and key shortcuts
        this.setupSecurityMeasures();
        
        console.log('✅ AI detection active');
    }
    
    /**
     * Stop monitoring
     */
    stop() {
        this.isActive = false;
        
        // Clear intervals
        if (this.frameProcessingInterval) {
            clearInterval(this.frameProcessingInterval);
            this.frameProcessingInterval = null;
        }
        
        if (this.audioProcessingInterval) {
            clearInterval(this.audioProcessingInterval);
            this.audioProcessingInterval = null;
        }
        
        // Remove listeners
        if (this.tabSwitchListener) {
            document.removeEventListener('visibilitychange', this.tabSwitchListener);
            this.tabSwitchListener = null;
        }
        
        // Stop media streams
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
        }
        
        console.log('⏹️ AI detection stopped');
    }
    
    /**
     * Capture and process video frame
     */
    async processVideoFrame() {
        if (!this.isActive || !this.videoElement) return;
        
        try {
            // Capture frame from video
            this.canvas.width = this.videoElement.videoWidth;
            this.canvas.height = this.videoElement.videoHeight;
            this.canvasContext.drawImage(this.videoElement, 0, 0);
            
            // Convert to base64
            const frameBase64 = this.canvas.toDataURL('image/jpeg', 0.8);
            
            // Send to backend for AI processing
            const response = await fetch(`${this.apiBaseUrl}/monitoring/frame/${this.submissionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    frame: frameBase64,
                    timestamp: new Date().toISOString()
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                this.handleDetectionResult(result);
            } else {
                console.error('Frame processing failed:', response.status);
            }
            
        } catch (error) {
            console.error('Error processing frame:', error);
        }
    }
    
    /**
     * Capture and process audio
     */
    async processAudio() {
        if (!this.isActive || !this.audioStream) return;
        
        try {
            // Create audio context
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(this.audioStream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            let audioData = [];
            
            // Collect audio samples
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                audioData = audioData.concat(Array.from(inputData));
                
                // Stop after 1 second of data
                if (audioData.length >= audioContext.sampleRate) {
                    processor.disconnect();
                    source.disconnect();
                    audioContext.close();
                    
                    // Convert to base64
                    const audioArray = new Int16Array(audioData.map(n => n * 32767));
                    const audioBlob = new Blob([audioArray], { type: 'audio/raw' });
                    
                    const reader = new FileReader();
                    reader.onloadend = async () => {
                        const audioBase64 = reader.result;
                        
                        // Send to backend
                        const response = await fetch(`${this.apiBaseUrl}/monitoring/audio/${this.submissionId}`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${this.token}`
                            },
                            body: JSON.stringify({
                                audio: audioBase64,
                                timestamp: new Date().toISOString()
                            })
                        });
                        
                        if (response.ok) {
                            const result = await response.json();
                            this.handleDetectionResult(result);
                        }
                    };
                    
                    reader.readAsDataURL(audioBlob);
                }
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
        } catch (error) {
            console.error('Error processing audio:', error);
        }
    }
    
    /**
     * Setup tab switch detection
     */
    setupTabSwitchDetection() {
        let exitTimestamp = null;
        let exitCount = 0;
        
        this.tabSwitchListener = async () => {
            if (document.hidden) {
                exitTimestamp = Date.now();
                this.showFullscreenWarning(true);
                
                // Auto-submit if away too long
                setTimeout(async () => {
                    if (document.hidden) {
                        const duration = Date.now() - exitTimestamp;
                        if (duration >= 5000) {
                            await this.triggerAutoSubmit('Extended absence from exam page');
                        }
                    }
                }, 5000);
                
            } else {
                this.showFullscreenWarning(false);
                
                if (exitTimestamp) {
                    const duration = Date.now() - exitTimestamp;
                    
                    // Report to backend
                    const response = await fetch(`${this.apiBaseUrl}/monitoring/tab-switch/${this.submissionId}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({
                            is_focused: false,
                            duration: duration,
                            timestamp: new Date().toISOString()
                        })
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        
                        // Only trigger violation for significant exits
                        if (duration >= 3000 || exitCount > 0) {
                            this.handleDetectionResult(result);
                        } else {
                            // First quick exit - soft warning
                            this.showToast('Please stay on the exam page');
                        }
                        
                        exitCount++;
                    }
                    
                    exitTimestamp = null;
                }
            }
        };
        
        document.addEventListener('visibilitychange', this.tabSwitchListener);
    }
    
    /**
     * Setup security measures
     */
    setupSecurityMeasures() {
        // Prevent right-click
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showToast('Right-click disabled during exam');
            return false;
        });
        
        // Prevent keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
            if (e.key === 'F12' || 
                (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
                (e.ctrlKey && e.key === 'u')) {
                e.preventDefault();
                this.showToast('Developer tools disabled during exam');
                return false;
            }
            
            // Prevent print
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                this.showToast('Printing disabled during exam');
                return false;
            }
        });
    }
    
    /**
     * Handle detection results from backend
     */
    handleDetectionResult(result) {
        if (result.violations && result.violations.length > 0) {
            result.violations.forEach(violation => {
                // Skip soft alerts (not actual violations)
                if (violation.is_warning === false) {
                    this.showSoftAlert(violation.message);
                    return;
                }
                
                // Process actual violation
                this.processViolation(violation);
            });
        }
    }
    
    /**
     * Process a detected violation
     */
    processViolation(violation) {
        // Add to violations list
        this.violations.push(violation);
        
        // Calculate warning deduction based on severity
        const deduction = DETECTION_CONFIG.warnings.warningValues[violation.severity] || 1;
        this.warningCount = Math.max(0, this.warningCount - deduction);
        
        // Callback for warning update
        if (this.onWarningUpdate) {
            this.onWarningUpdate(this.warningCount, violation);
        }
        
        // Show violation modal
        this.showViolationModal(violation);
        
        // Callback for violation
        if (this.onViolation) {
            this.onViolation(violation, this.warningCount);
        }
        
        // Check for auto-submit
        if (this.warningCount <= 0) {
            setTimeout(() => {
                this.triggerAutoSubmit('Multiple cheating violations detected');
            }, 3000);
        }
        
        console.log(`⚠️ Violation: ${violation.type} (${violation.severity}) - Warnings: ${this.warningCount}`);
    }
    
    /**
     * Show violation modal to user
     */
    showViolationModal(violation) {
        // Get or create modal elements
        let overlay = document.getElementById('cheatingOverlay');
        let modal = document.getElementById('cheatingAlert');
        
        if (!overlay || !modal) {
            console.error('Violation modal elements not found');
            return;
        }
        
        // Update modal content
        const alertTitle = document.getElementById('alertTitle');
        const alertMessage = document.getElementById('alertMessage');
        const alertCount = document.getElementById('alertCount');
        const violationType = document.getElementById('violationType');
        
        if (alertTitle) {
            alertTitle.textContent = this.warningCount <= 1 ? 'Final Warning!' : 'Warning!';
        }
        
        if (alertMessage) {
            alertMessage.textContent = violation.message;
        }
        
        if (alertCount) {
            alertCount.textContent = Math.round(this.warningCount * 2) / 2; // Show as 0.5, 1, 1.5, etc.
        }
        
        if (violationType) {
            violationType.textContent = this.formatViolationType(violation.type);
        }
        
        // Show modal
        overlay.classList.add('show');
        modal.classList.add('show');
        
        // Flash warning on sidebar
        const warningElement = document.getElementById('cheatingWarning');
        const warningMessage = document.getElementById('warningMessage');
        
        if (warningElement && warningMessage) {
            warningMessage.textContent = violation.message;
            warningElement.classList.add('show');
            
            setTimeout(() => {
                warningElement.classList.remove('show');
            }, 5000);
        }
    }
    
    /**
     * Show soft alert (no violation)
     */
    showSoftAlert(message) {
        const warningElement = document.getElementById('cheatingWarning');
        const warningMessage = document.getElementById('warningMessage');
        
        if (warningElement && warningMessage) {
            warningMessage.textContent = message;
            warningElement.classList.add('show');
            warningElement.style.background = '#fff3cd'; // Yellow, not red
            
            setTimeout(() => {
                warningElement.classList.remove('show');
                warningElement.style.background = ''; // Reset
            }, 3000);
        }
    }
    
    /**
     * Show toast notification
     */
    showToast(message) {
        // Simple toast implementation
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #333;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    /**
     * Show/hide fullscreen warning banner
     */
    showFullscreenWarning(show) {
        const warning = document.getElementById('fullscreenWarning');
        if (warning) {
            if (show) {
                warning.classList.add('show');
            } else {
                warning.classList.remove('show');
            }
        }
    }
    
    /**
     * Format violation type for display
     */
    formatViolationType(type) {
        const types = {
            'multiple_faces': 'Multiple Faces Detected',
            'looking_away': 'Looking Away from Screen',
            'phone_detected': 'Mobile Phone Detected',
            'voice_detected': 'Talking Detected',
            'tab_switch': 'Tab Switching',
            'head_pose_alert': 'Head Position'
        };
        
        return types[type] || type.replace(/_/g, ' ').toUpperCase();
    }
    
    /**
     * Trigger auto-submit
     */
    async triggerAutoSubmit(reason) {
        console.log(`🚨 Auto-submit triggered: ${reason}`);
        
        this.stop();
        
        // Report to backend
        await fetch(`${this.apiBaseUrl}/monitoring/auto-submit/${this.submissionId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({
                reason: reason,
                violations: this.violations,
                timestamp: new Date().toISOString()
            })
        });
        
        // Callback
        if (this.onAutoSubmit) {
            this.onAutoSubmit(reason);
        }
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            isActive: this.isActive,
            warningCount: this.warningCount,
            violationCount: this.violations.length,
            violations: this.violations
        };
    }
}

export default AIDetectionEngine;