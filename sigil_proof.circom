pragma circom 2.0.0;

include "circuits/poseidon.circom";

template SigilProof() {
    // PRIVATE INPUT: The user's harmonic secret (private witness).
    signal input secret;

    // PUBLIC INPUT: The expected KaiSignature commitment.
    signal input expectedHash;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== secret;

    // Enforce: Poseidon(secret) == expectedHash
    expectedHash === hasher.out;
}

// Compile entry point
component main { public [expectedHash] } = SigilProof();
