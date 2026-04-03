use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce 
};
use pbkdf2::pbkdf2_hmac;
use sha2::Sha256;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use std::sync::OnceLock;
use machineid_rs::{IdBuilder, Encryption, HWIDComponent};

const SALT: &[u8] = b"izorate-secure-vault-2026";
const ENC_PREFIX: &str = "enc:";

static CRYPTO_KEY: OnceLock<[u8; 32]> = OnceLock::new();

pub fn get_encryption_key() -> [u8; 32] {
    *CRYPTO_KEY.get_or_init(|| {
        let mut builder = IdBuilder::new(Encryption::MD5);
        builder.add_component(HWIDComponent::CPUID);
        builder.add_component(HWIDComponent::SystemID);
        
        let mid = builder.build("izorate")
            .unwrap_or_else(|_| "izorate-fallback-key-0000".to_string());
        
        let mut key = [0u8; 32];
        pbkdf2_hmac::<Sha256>(mid.as_bytes(), SALT, 1000, &mut key);
        key
    })
}

pub fn encrypt(text: &str) -> String {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng); // Uses AeadCore trait
    
    if let Ok(ciphertext) = cipher.encrypt(&nonce, text.as_bytes()) {
        let mut combined = nonce.to_vec();
        combined.extend_from_slice(&ciphertext);
        format!("{}{}", ENC_PREFIX, BASE64.encode(combined))
    } else {
        text.to_string()
    }
}

pub fn decrypt(enc_text: &str) -> String {
    if !enc_text.starts_with(ENC_PREFIX) {
        return enc_text.to_string();
    }
    
    let encrypted_data = &enc_text[ENC_PREFIX.len()..];
    let Ok(data) = BASE64.decode(encrypted_data) else {
        return enc_text.to_string();
    };
    
    if data.len() < 12 { return enc_text.to_string(); }
    
    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key).unwrap();
    
    if let Ok(decrypted) = cipher.decrypt(nonce, ciphertext) {
        String::from_utf8(decrypted).unwrap_or_else(|_| enc_text.to_string())
    } else {
        enc_text.to_string()
    }
}
