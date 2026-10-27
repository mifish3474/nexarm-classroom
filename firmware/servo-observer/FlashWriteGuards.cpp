// Linked with --wrap for every API below by the reviewed build helper.
// This also blocks SDK panic-dump writes. It does not modify the bootloader.
#include <Arduino.h>
#include <esp_flash.h>
#include <esp_partition.h>
#include <esp_spi_flash.h>

extern "C" {
esp_err_t IRAM_ATTR __wrap_esp_partition_write(const esp_partition_t *, size_t, const void *, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_esp_partition_write_raw(const esp_partition_t *, size_t, const void *, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_esp_partition_erase_range(const esp_partition_t *, size_t, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_esp_flash_write(esp_flash_t *, const void *, uint32_t, uint32_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_esp_flash_erase_region(esp_flash_t *, uint32_t, uint32_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_spi_flash_write(size_t, const void *, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_spi_flash_write_encrypted(size_t, const void *, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_spi_flash_erase_range(size_t, size_t) { return ESP_ERR_NOT_SUPPORTED; }
esp_err_t IRAM_ATTR __wrap_spi_flash_erase_sector(size_t) { return ESP_ERR_NOT_SUPPORTED; }
}
