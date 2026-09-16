/**
 * ProctorVision Detection Configuration
 * Centralized configuration for all AI detection systems
 */

export const DETECTION_CONFIG = {
    // Global settings
    global: {
        enabled: true,
        debug: false, // Set to true for verbose logging
        logLevel: 'info'
    },
    
    // Multiple Face Detection
    faces: {
        enabled: true,
        maxAllowed: 1,
        minConsecutiveFrames: 3,
        detectionWindow: 5, // seconds
        confidenceThreshold: 0.7,
        cooldownPeriod: 30, // seconds
        severity: 'high',
        warningDeduction: 2
    },
    
    // Voice Detection
    audio: {
        enabled: true,
        silenceThreshold: -40, // dB
        speechDuration: 2000, // ms
        humanVoiceFreqRange: [85, 255], // Hz
        confidenceThreshold: 0.65,
        cooldownPeriod: 45, // seconds
        graceAtStart: 10, // seconds (ignore first 10s)
        severity: 'medium',
        warningDeduction: 1
    },
    
    // Head Pose Detection
    headPose: {
        enabled: true,
        alertThreshold: 15, // seconds (soft warning)
        violationThreshold: 25, // seconds (hard violation)
        allowedAngleDeviation: 35, // degrees from center
        samplingRate: 500, // ms
        cooldownPeriod: 60, // seconds
        decayRate: 2, // multiplier for recovery
        graceAtStart: 120, // seconds (2 minutes grace period)
        severity: 'low',
        warningDeduction: 0.5
    },
    
    // Phone Detection
    phone: {
        enabled: true,
        minConsecutiveFrames: 5,
        detectionWindow: 8, // seconds
        confidenceThreshold: 0.75,
        maxObjectSize: 0.15, // 15% of frame
        movementThreshold: 0.1,
        cooldownPeriod: 90, // seconds
        severity: 'high',
        warningDeduction: 2
    },
    
    // Fullscreen/Tab Switch Detection
    fullscreen: {
        enabled: true,
        exitGracePeriod: 3000, // ms
        warningThreshold: 1,
        violationThreshold: 2,
        autoSubmitDuration: 5000, // ms
        cooldownPeriod: 0, // no cooldown (each exit matters)
        severity: 'medium',
        warningDeduction: 1
    },
    
    // Warning System
    warnings: {
        initial: 3, // Start with 3 warnings
        warningValues: {
            low: 0.5,
            medium: 1.0,
            high: 2.0
        },
        recoveryEnabled: false, // Set to true to enable recovery
        recoveryInterval: 600000, // 10 minutes
        recoveryAmount: 0.5,
        autoSubmitAt: 0
    },
    
    // UI Settings
    ui: {
        showViolationModal: true,
        modalDuration: 5000, // ms
        blockExamDuringModal: true,
        showWarningCount: true,
        showViolationType: true,
        colors: {
            firstWarning: '#FFC107',
            secondWarning: '#FF9800',
            finalWarning: '#F44336'
        }
    },
    
    // Technical Settings
    technical: {
        frameProcessingInterval: 2000, // ms (process every 2 seconds)
        audioProcessingInterval: 3000, // ms (process every 3 seconds)
        maxFrameSize: 640, // pixels (width)
        imageQuality: 0.8, // JPEG quality (0-1)
        healthCheckInterval: 5000 // ms
    },
    
    // Accessibility Accommodations (for students with disabilities)
    accommodations: {
        enabled: false, // Set to true when student has accommodations
        disableHeadPose: false, // Set to true to completely disable
        headPoseThreshold: 45, // Wider angle allowance
        audioSensitivity: 'normal', // 'low', 'normal', 'high'
        multipleObjectTolerance: 0 // Allow N additional "faces" (e.g., service animal)
    }
};

/**
 * Get configuration for specific detection type
 */
export function getDetectionConfig(type) {
    return DETECTION_CONFIG[type] || {};
}

/**
 * Update configuration at runtime
 */
export function updateConfig(path, value) {
    const keys = path.split('.');
    let current = DETECTION_CONFIG;
    
    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
    console.log(`Config updated: ${path} = ${value}`);
}

/**
 * Enable accommodation mode
 */
export function enableAccommodations(accommodations) {
    DETECTION_CONFIG.accommodations.enabled = true;
    
    if (accommodations.headPoseDisabled) {
        DETECTION_CONFIG.headPose.enabled = false;
    }
    
    if (accommodations.widerHeadPoseThreshold) {
        DETECTION_CONFIG.headPose.allowedAngleDeviation = 45;
    }
    
    if (accommodations.lowerAudioSensitivity) {
        DETECTION_CONFIG.audio.confidenceThreshold = 0.8;
    }
    
    console.log('✅ Accommodations enabled:', accommodations);
}

export default DETECTION_CONFIG;